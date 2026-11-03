import {readFile} from 'node:fs/promises';
import {query,transaction} from './db.mjs';
import {airtable,allRecords,tables} from './airtable.mjs';
import {sync,ingest,processQueue,mirror} from './jobs.mjs';
import {hash} from './core.mjs';
import {startRun,finishRun,runJob} from './telemetry.mjs';
export async function enableBanglaFeeds(pageId){
  if(!/^rec[A-Za-z0-9]+$/.test(pageId||''))throw new Error('Choose a Page first');
  const catalog=JSON.parse(await readFile(new URL('../sources/bangla-rss-catalog.json',import.meta.url),'utf8'));
  const urls=new Set(catalog.sources.filter(s=>s.verified).map(s=>s.url));
  const feeds=(await allRecords(tables().feeds)).filter(f=>urls.has(f.fields['RSS / Scraper URL']));
  for(let i=0;i<feeds.length;i+=10)await airtable(tables().feeds,{method:'PATCH',body:{records:feeds.slice(i,i+10).map(f=>({id:f.id,fields:{'Active Status':true,'Linked Page':[...new Set([...(f.fields['Linked Page']||[]),pageId])]}}))}});
  await sync();return {enabled:feeds.length,pageId};
}
export async function startPreview(pageId){
  if(process.env.DRY_RUN==='false')throw new Error('Enable dry-run before generating a preview');
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
        const ingestion=await runJob('ingest',()=>ingest({pageId,limitPerFeed:1}),'preview');
        if(ingestion.blocked){await finishRun(result.runId,ingestion);return;}
        const processing=await runJob('process',()=>processQueue({preview:true,pageId}),'preview');
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
    const article=(await query('SELECT a.*,p.config FROM echolink.articles a JOIN echolink.configurations p ON p.kind=\'page\' AND p.id=a.page_id WHERE a.id=$1',[id])).rows[0];
    if(!article||!['Pending Approval','Approved','Dry Run','Queued'].includes(article.status)||!article.caption)throw new Error('Only an unpublished draft can be edited');
    const pageLock=await guard.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired',['echolink:page:'+article.page_id]);
    if(!pageLock.rows[0].acquired)throw new Error('Page processing is running. Retry shortly');
    // Reread after acquiring the same page lock used by publication.
    const current=(await query('SELECT status FROM echolink.articles WHERE id=$1',[id])).rows[0];
    if(!['Pending Approval','Approved','Dry Run','Queued'].includes(current.status))throw new Error('Article is no longer editable');
    const caption=String(body.caption??article.caption).trim();if(!caption||caption.length>1800)throw new Error('Caption must contain 1–1800 characters');
    let image=body.imageURL===undefined?article.image_url:String(body.imageURL).trim()||null;
    if(image){const u=new URL(image);if(u.protocol!=='https:'||u.username||u.password)throw new Error('Use an HTTPS media URL');image=u.toString();}
    const scheduled=body.scheduledAt?new Date(body.scheduledAt):body.scheduledAt===''?null:article.scheduled_at;
    if(scheduled&&(!Number.isFinite(new Date(scheduled).getTime())||new Date(scheduled)<=new Date()))throw new Error('Choose a future scheduled time');
    // Clear old external approval while holding the approvals and page locks.
    if(article.airtable_id)await airtable(tables().log,{method:'PATCH',body:{records:[{id:article.airtable_id,fields:{'Approval Decision':null,'AI Generated Caption':caption}}]}});
    await query("UPDATE echolink.articles SET caption=$2,caption_hash=$3,image_url=$4,scheduled_at=$5,approval_hash=NULL,status='Pending Approval',attempts=0,last_error=NULL,next_attempt_at=now(),dirty=true,updated_at=now() WHERE id=$1",[id,caption,hash(caption),image,scheduled]);
    return {ok:true,status:'Pending Approval',requiresFreshApproval:true};
  },{coordination:true});
}
