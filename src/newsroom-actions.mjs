import {readFile} from 'node:fs/promises';
import {query,transaction} from './db.mjs';
import {airtable,allRecords,tables} from './airtable.mjs';
import {sync,ingest,processQueue,mirror,publicationReadiness} from './jobs.mjs';
import {hash} from './core.mjs';
import {startRun,finishRun,runJob} from './telemetry.mjs';
import {validateSlot} from './calendar.mjs';
export async function enableBanglaFeeds(pageId){
  if(!/^rec[A-Za-z0-9]+$/.test(pageId||''))throw new Error('Choose a Page first');
  const catalog=JSON.parse(await readFile(new URL('../sources/bangla-rss-catalog.json',import.meta.url),'utf8'));
  const urls=new Set(catalog.sources.filter(s=>s.verified).map(s=>s.url));
  const feeds=(await allRecords(tables().feeds)).filter(f=>urls.has(f.fields['RSS / Scraper URL']));
  for(let i=0;i<feeds.length;i+=10)await airtable(tables().feeds,{method:'PATCH',body:{records:feeds.slice(i,i+10).map(f=>({id:f.id,fields:{'Active Status':true,'Linked Page':[...new Set([...(f.fields['Linked Page']||[]),pageId])]}}))}});
  await sync();return {enabled:feeds.length,pageId};
}
export async function startPreview(pageId,articleId){
  if(!/^rec[A-Za-z0-9]+$/.test(pageId||''))throw new Error('Choose an enabled Page first');
  const result=await transaction(async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('echolink:preview-start',0))");
    await client.query("UPDATE echolink.job_runs SET status='Interrupted',finished_at=now(),error='Preview interrupted; restart after checking service status' WHERE job='preview' AND status='Running' AND started_at<now()-interval '20 minutes'");
    const prior=(await client.query("SELECT id FROM echolink.job_runs WHERE job='preview' AND status='Running' ORDER BY started_at DESC LIMIT 1")).rows[0];
    return prior?{runId:prior.id,existing:true}:{runId:await startRun('preview','dashboard'),existing:false};
  });
  if(!result.existing){
    void (async()=>{
      try{
        await runJob('sync',sync,'preview');
        const ingestion=articleId?{selectedArticle:articleId}:await runJob('ingest',()=>ingest({pageId,limitPerFeed:1}),'preview');
        if(ingestion.blocked){await finishRun(result.runId,ingestion);return;}
        const processing=await runJob('process',()=>processQueue({preview:true,pageId,articleId}),'preview');
        const mirrored=await runJob('mirror',mirror,'preview');
        const draftIds=(processing.pages||[]).map(p=>p.pending).filter(Boolean);
        await finishRun(result.runId,{ingestion,processing,mirrored,draftIds,...(!draftIds.length?{blocked:true,reason:processing.reason||'No new eligible draft. Review existing drafts and Activity errors.'}:{})});
      }catch(error){await finishRun(result.runId,null,error).catch(()=>{});}
    })();
  }
  return {ok:true,...result};
}
export async function editDraft(id,body){
  return transaction(async guard=>{
    const lock=await guard.query("SELECT pg_try_advisory_xact_lock(hashtextextended('echolink:approvals',0)) AS acquired");
    if(!lock.rows[0].acquired)throw new Error('Review sync is running. Retry shortly');
    let article=(await query('SELECT a.* FROM echolink.articles a WHERE a.id=$1',[id])).rows[0];
    if(!article||!['Draft','Pending Approval','Approved','Dry Run','Queued','Rejected','Failed'].includes(article.status)||!article.caption)throw new Error('Only an unpublished draft can be edited');
    const pageLock=await guard.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired',['echolink:page:'+article.page_id]);
    if(!pageLock.rows[0].acquired)throw new Error('Page processing is running. Retry shortly');
    // Reread after acquiring the same page lock used by publication.
    article=(await query('SELECT * FROM echolink.articles WHERE id=$1',[id])).rows[0];
    if(!['Draft','Pending Approval','Approved','Dry Run','Queued','Rejected','Failed'].includes(article.status))throw new Error('Article is no longer editable');
    if(body.expectedVersion&&new Date(body.expectedVersion).getTime()!==new Date(article.updated_at).getTime())throw new ContentActionError('This post changed in another session. Refresh before saving');
    const caption=String(body.caption??article.caption).trim();if(!caption||caption.length>1800)throw new Error('Caption must contain 1–1800 characters');
    let image=body.imageURL===undefined?article.image_url:String(body.imageURL).trim()||null;
    if(image){const u=new URL(image);if(u.protocol!=='https:'||u.username||u.password)throw new Error('Use an HTTPS media URL');image=u.toString();}
    const scheduled=body.scheduledAt?new Date(body.scheduledAt):body.scheduledAt===''?null:article.scheduled_at;
    if(scheduled&&(!Number.isFinite(new Date(scheduled).getTime())||new Date(scheduled)<=new Date()))throw new Error('Choose a future scheduled time');
    // Clear old external approval while holding the approvals and page locks.
    if(article.airtable_id)await airtable(tables().log,{method:'PATCH',body:{records:[{id:article.airtable_id,fields:{'Approval Decision':null,'AI Generated Caption':caption}}]}});
    const status=body.intent==='draft'?'Draft':'Pending Approval';
    const saved=await query("UPDATE echolink.articles SET caption=$2,caption_hash=$3,image_url=$4,scheduled_at=$5,approval_hash=NULL,status=$6,attempts=0,last_error=NULL,next_attempt_at=now(),dirty=true,updated_at=now() WHERE id=$1 RETURNING updated_at",[id,caption,hash(caption),image,status==='Draft'?null:scheduled,status]);
    return {ok:true,status,updatedAt:saved.rows[0].updated_at,requiresFreshApproval:true};
  },{coordination:true});
}
export class ContentActionError extends Error{constructor(message,status=409){super(message);this.status=status;}}
export async function articleAction(id,action,body={}){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||'')||!['draft','review','approve','schedule','publish','generate'].includes(action))throw new ContentActionError('Choose a valid article action',400);
  if(['approve','schedule','publish'].includes(action)&&body.confirmed!==true)throw new ContentActionError('Review the saved caption and confirm this action',400);
  const article=await transaction(async guard=>{
    const review=await guard.query("SELECT pg_try_advisory_xact_lock(hashtextextended('echolink:approvals',0)) AS acquired");
    if(!review.rows[0].acquired)throw new ContentActionError('Approval sync is running. Retry shortly');
    const first=(await query('SELECT page_id FROM echolink.articles WHERE id=$1',[id])).rows[0];
    if(!first)throw new ContentActionError('Article not found',404);
    const lock=await guard.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired',['echolink:page:'+first.page_id]);
    if(!lock.rows[0].acquired)throw new ContentActionError('This Page is processing. Retry shortly');
    const a=(await query('SELECT id,page_id,status,caption,caption_hash,image_url,airtable_id,scheduled_at,updated_at FROM echolink.articles WHERE id=$1',[id])).rows[0];
    if(body.expectedVersion&&new Date(body.expectedVersion).getTime()!==new Date(a.updated_at).getTime())throw new ContentActionError('This post changed in another session. Refresh before acting');
    if(action==='generate'){
      if(a.status!=='Queued'||a.caption)throw new ContentActionError('Only raw queued news can be selected for generation');
      return a;
    }
    if(!a.caption||!['Draft','Pending Approval','Approved','Dry Run','Queued','Rejected','Failed'].includes(a.status))throw new ContentActionError('This article is not an editable unpublished post');
    if(action==='publish'){
      const ready=await publicationReadiness(a.page_id);if(!ready.ready)throw new ContentActionError(ready.reason);
    }
    let at=action==='approve'?a.scheduled_at:null;
    if(action==='schedule'){
      at=new Date(body.scheduledAt);if(!Number.isFinite(at.getTime())||at<=new Date())throw new ContentActionError('Choose a future scheduled time',400);
      const conflict=await validateSlot(a.page_id,at,a.id);if(conflict)throw new ContentActionError(conflict,409);
    }
    if(action==='approve'&&at){
      if(new Date(at)<=new Date())throw new ContentActionError('Scheduled time has passed. Choose a future Schedule time or Publish Now');
      const conflict=await validateSlot(a.page_id,at,a.id);if(conflict)throw new ContentActionError(conflict,409);
    }
    if(action==='publish'){const conflict=await validateSlot(a.page_id,new Date(),a.id);if(conflict)throw new ContentActionError(conflict,409);}
    const approved=['approve','schedule','publish'].includes(action),status=action==='draft'?'Draft':approved?'Approved':'Pending Approval';
    // Synchronize existing external approvals under the same locks before
    // changing canonical state. Held Draft rows never enter the processing queue.
    if(a.airtable_id)await airtable(tables().log,{method:'PATCH',body:{records:[{id:a.airtable_id,fields:{'Approval Decision':approved?'Approved':null,'AI Generated Caption':a.caption}}]}});
    await query('UPDATE echolink.articles SET status=$2,approval_hash=$3,scheduled_at=$4,next_attempt_at=now(),dirty=true,updated_at=now() WHERE id=$1',[id,status,approved?hash(a.caption):null,at]);
    return {...a,status};
  },{coordination:true});
  if(action==='generate')return startPreview(article.page_id,id);
  if(action==='publish'){
    const runId=await startRun('publish-now','dashboard');
    void(async()=>{
      try{
        const result=await processQueue({pageId:article.page_id,articleId:id});
        const mirrored=await mirror().catch(()=>({failed:true,reason:'Publication state saved; mirroring will retry'}));
        await finishRun(runId,{...result,articleId:id,mirrored});
      }catch(error){await finishRun(runId,{articleId:id},error).catch(()=>{});}
    })();
    return {ok:true,runId,status:'Approved',message:'Publishing started; check Activity and Published for the confirmed result'};
  }
  return {ok:true,status:article.status,message:action==='draft'?'Saved as a held draft; it will not publish':action==='review'?'Submitted for review':action==='schedule'?'Approved and scheduled; Page posting rules still apply':'Approved for the next eligible processing run'};
}
