import '../server/env.mjs';
import {parseEnv} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import pg from 'pg';
import {transaction,closeDatabase,audit} from '../server/db.mjs';
const path=process.argv[2],execute=process.argv.includes('--execute'),enablePages=process.argv.includes('--enable-pages'),index=process.argv.indexOf('--post'),postId=index>=0?process.argv[index+1]:null;
if(process.env.PLATFORM_BRANCH!=='echolink-platform-local'||!path)throw new Error('Use the isolated platform branch and pass the legacy environment path.');
const live=parseEnv(await readFile(path,'utf8')),workflowId='echolinkPipeline01',base=new URL(live.N8N_BASE_URL||'http://localhost:5678');if(!['localhost','127.0.0.1'].includes(base.hostname))throw new Error('Cutover only supports the local n8n instance.');
const headers={'X-N8N-API-KEY':live.N8N_API_KEY,'content-type':'application/json'};
async function n8n(route,{method='GET'}={}){const r=await fetch(base.origin+'/api/v1/'+route,{method,headers,signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('n8n control failed (HTTP '+r.status+').');return r.json();}
const prior=await n8n('workflows/'+workflowId),sourceURL=new URL(live.DATABASE_URL);sourceURL.searchParams.set('sslmode','verify-full');const source=new pg.Client({connectionString:sourceURL.href,connectionTimeoutMillis:15000,statement_timeout:30000});let stopped=false;
try{
 await source.connect();const actor=(await transaction(null,db=>db.query("SELECT a.*,w.id AS workspace_id FROM creator.accounts a JOIN creator.workspaces w ON w.owner_id=a.id WHERE lower(a.email)=lower($1) AND a.email_verified AND a.role='super_admin'",[process.env.PLATFORM_OWNER_EMAIL]),{owner:true})).rows[0];if(!actor)throw new Error('Verified owner workspace required.');
 const w=actor.workspace_id,mappings=(await transaction(w,db=>db.query("SELECT * FROM creator.legacy_imports WHERE workspace_id=$1 AND kind='page' AND source='legacy-live'",[w]))).rows;
 console.log(JSON.stringify({mode:execute?'requested cutover':'read-only plan',legacyWorkflowActive:prior.active,migratedPages:mappings.length,postId:postId||null,steps:['Require a reviewed, approved v2 post with a creative.','Pause only the old newsroom dispatcher.','Wait for all in-flight legacy executions to finish.','Reconcile confirmed publication history to prevent duplicates.','Enable only the selected v2 Page; no routine is enabled.','Restart v2, then publish the reviewed test explicitly.'],publicDeploymentIncluded:false}));
 if(!execute)process.exitCode=0;
 else{
  if(!postId&&!enablePages)throw new Error('Pass --post with a reviewed post ID, or --enable-pages to enable manual publishing without submitting a post.');
  const selected=postId?(await transaction(w,db=>db.query('SELECT * FROM creator.posts WHERE workspace_id=$1 AND id=$2',[w,postId]))).rows[0]:null;
  if(postId&&(!selected||selected.status!=='approved'||selected.approved_version!==selected.version||!selected.creative.assetId))throw new Error('The exact current post and photo must be approved in the dashboard first.');
  const mapping=selected?mappings.find(m=>m.resource_id===selected.page_id):null;if(selected&&!mapping)throw new Error('The selected post does not belong to an imported Page.');
  if((await transaction(w,db=>db.query('SELECT id FROM creator.automation_rules WHERE workspace_id=$1 AND enabled',[w]))).rowCount)throw new Error('Pause v2 automatic routines for this controlled first publication test.');
  if(prior.active){await n8n('workflows/'+workflowId+'/deactivate',{method:'POST'});stopped=true;}
  const until=Date.now()+5*60000;
  while(true){
   const executions=await n8n('executions?workflowId='+workflowId+'&status=running&limit=1');
   const processing=(await source.query("SELECT EXISTS(SELECT 1 FROM echolink.job_schedule WHERE job='process' AND lease_until>now()) OR EXISTS(SELECT 1 FROM echolink.articles WHERE status='Publishing') AS busy")).rows[0].busy;
   if(!executions.data?.length&&!processing)break;if(Date.now()>until)throw new Error('Legacy publication is still running. Wait for it to finish and retry the cutover.');await new Promise(resolve=>setTimeout(resolve,3000));
  }
  const published=(await source.query("SELECT * FROM echolink.articles WHERE status='Posted' AND fb_post_id IS NOT NULL")).rows;
  await transaction(w,async db=>{for(const p of published){const target=mappings.find(m=>m.source_id===p.page_id);if(!target)continue;
   await db.query(`INSERT INTO creator.posts(id,workspace_id,page_id,type,title,body,source_url,source_hash,caption,status,fb_post_id,published_at,website_url,creative,seo) VALUES($1,$2,$3,'news',$4,$5,$6,$7,$8,'published',$9,$10,$11,$12,'{"legacyStatus":"Posted"}') ON CONFLICT(page_id,source_hash) WHERE source_hash IS NOT NULL DO UPDATE SET status='published',fb_post_id=EXCLUDED.fb_post_id,published_at=EXCLUDED.published_at,caption=EXCLUDED.caption,website_url=COALESCE(EXCLUDED.website_url,creator.posts.website_url),updated_at=now() WHERE creator.posts.workspace_id=$2`,[p.id,w,target.resource_id,p.title.slice(0,140),p.body||'',p.source_url,p.url_hash,p.caption||'',p.fb_post_id,p.published_at,p.website_url,{sourceImage:p.image_url,ratio:'1:1',style:'editorial'}]);
  }});
  if(selected){const current=(await transaction(w,db=>db.query('SELECT status FROM creator.posts WHERE workspace_id=$1 AND id=$2',[w,postId]))).rows[0];if(current.status==='published')throw new Error('The old publisher already delivered this story. Its Facebook reference is now reconciled in v2. Prepare a different reviewed draft for the test.');}
  await transaction(w,async db=>{for(const target of selected?[mapping]:mappings){await db.query("UPDATE creator.legacy_imports SET detail=jsonb_set(detail,'{requiresCutover}','false') WHERE workspace_id=$1 AND resource_id=$2 AND kind='page'",[w,target.resource_id]);await db.query('UPDATE creator.pages SET active=true WHERE workspace_id=$1 AND id=$2 AND fb_verified',[w,target.resource_id]);await audit(db,w,actor,'migration.publisher_cutover','page',target.resource_id,{legacyWorkflowId:workflowId,reviewPostId:postId,reconciledPublications:published.length});}});
  const envFile=new URL('../.env.local',import.meta.url);let content=await readFile(envFile,'utf8');content=content.replace(/^PLATFORM_PUBLISHING_ENABLED=.*\r?\n?/gm,'').trimEnd()+'\nPLATFORM_PUBLISHING_ENABLED=true\n';await writeFile(envFile,content);
  stopped=false;console.log('Cutover prepared. The old dispatcher is paused. Verified imported Pages allow manual publication after restarting v2. No post was submitted by this script.');
 }
}catch(error){if(stopped&&prior.active){await n8n('workflows/'+workflowId+'/activate',{method:'POST'});console.log('Cutover was not completed; the previous live dispatcher was restored.');}console.error(error.message);process.exitCode=1;}finally{await source.end();await closeDatabase();}
