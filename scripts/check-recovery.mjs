import '../src/env.mjs';
import {randomUUID} from 'node:crypto';
import {query,closePools} from '../src/db.mjs';
import {airtable,tables} from '../src/airtable.mjs';
if(process.env.DRY_RUN!=='true')throw new Error('Recovery integration probe requires dry-run mode');
const base='http://127.0.0.1:8787',ids=Array.from({length:4},()=>randomUUID());
let cookie;
async function api(path,body){return fetch(`${base}/admin/api/${path}`,{method:body?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(path==='ticket'?{Authorization:`Bearer ${process.env.WORKER_API_KEY}`}:{})},...(body?{body:JSON.stringify(body)}:{})});}
try{
  const ticket=await(await api('ticket',{})).json(),login=await api('session',{ticket:ticket.ticket});
  if(!login.ok)throw new Error('Login failed');cookie=login.headers.get('set-cookie').split(';')[0];
  const state=await(await api('state')).json();
  const page=state.pages.find(p=>!p.fields['Active Status']);if(!page)throw new Error('Need an inactive page for the probe');
  for(const [i,status]of ['Failed','Dry Run','Publish Unknown','Posted'].entries())await query(`INSERT INTO echolink.articles(id,page_id,url_hash,title_hash,title,source_url,body,status,approval_hash,attempts)
    VALUES($1::uuid,$2,($1::uuid)::text,($1::uuid)::text,'INTEGRATION RECOVERY PROBE','https://example.com/probe','Synthetic recovery test only',$3,'old-approval',5)`,[ids[i],page.id,status]);
  await query("INSERT INTO echolink.source_comments(article_id,page_id,fb_post_id,message,due_at,status) VALUES($1,$2,'NOT_A_REAL_POST','Synthetic test only',now()+interval '20 minutes','Failed')",[ids[3],page.id]);
  if((await api('retry',{id:ids[0],target:'article',confirmed:false})).status!==400)throw new Error('Retry did not require confirmation');
  for(const id of ids.slice(0,2))if(!(await api('retry',{id,target:'article',confirmed:true})).ok)throw new Error('Eligible article retry failed');
  const reset=(await query('SELECT status,approval_hash,attempts FROM echolink.articles WHERE id=ANY($1::uuid[])',[ids.slice(0,2)])).rows;
  if(reset.length!==2||reset.some(r=>r.status!=='Queued'||r.approval_hash!==null||r.attempts!==0))throw new Error('Requeue did not reset review/attempt state');
  console.log('PASS recovery: failed/dry-run articles requeue with explicit confirmation and fresh approval state.');
  if((await api('retry',{id:ids[2],target:'article',confirmed:true})).status!==409)throw new Error('Unknown remote post outcome was retried');
  console.log('PASS recovery: ambiguous publication outcomes cannot be retried through the dashboard.');
  if(!(await api('retry',{id:ids[3],target:'comment',confirmed:true})).ok)throw new Error('Definite comment failure retry failed');
  const comment=(await query('SELECT status,due_at>now() AS future FROM echolink.source_comments WHERE article_id=$1',[ids[3]])).rows[0];
  if(comment.status!=='Queued'||!comment.future)throw new Error('Comment retry bypassed its due time');
  console.log('PASS recovery: definitively failed source comment requeues without shortening its configured delay.');
}finally{
  const synced=(await query('SELECT airtable_id FROM echolink.articles WHERE id=ANY($1::uuid[])',[ids])).rows.filter(r=>r.airtable_id);
  for(const row of synced)await airtable(tables().log,{method:'DELETE',params:{'records[]':row.airtable_id}});
  await query('DELETE FROM echolink.source_comments WHERE article_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM echolink.articles WHERE id=ANY($1::uuid[])',[ids]);
  await closePools();console.log('Removed all recovery probe records. No remote post/comment request was made.');
}
