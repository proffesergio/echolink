import {createSign,createPrivateKey} from 'node:crypto';
import {remoteJSON} from './net.mjs';
import {AppError} from './errors.mjs';
import {transaction} from './db.mjs';
import {decryptSecret} from './vault.mjs';
const sheetHeaders=['Automation ID','Page','Panel','Status','Source title','Source URL','Source published at','Caption','Image URL','Image suggestion','Analysis','Selection score','Selection reason','Scheduled at','Published at','FB Post ID','Comment status','Comment ID','Updated at','Website URL','Website status'];
const legacyStatus={draft:'Queued',review:'Pending Approval',approved:'Approved',scheduled:'Approved',publishing:'Publishing',published:'Posted',unknown:'Publish Unknown',failed:'Failed',rejected:'Rejected'};
async function googleAccess(secret){
 let sa;try{sa=JSON.parse(secret.serviceAccount);if(sa.type!=='service_account'||!sa.client_email?.endsWith('.gserviceaccount.com')||createPrivateKey(sa.private_key).asymmetricKeyType!=='rsa')throw new Error();}catch{throw new AppError(400,'Save a valid Google service-account JSON key.');}
 const iat=Math.floor(Date.now()/1000),encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url'),message=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:sa.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat,exp:iat+3600}),signature=createSign('RSA-SHA256').update(message).sign(sa.private_key,'base64url');
 const data=await remoteJSON('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:message+'.'+signature}).toString()});if(!data.access_token)throw new AppError(502,'Google authorization failed.');return data.access_token;
}
async function sheets(c,secret,path='',{method='GET',body}={}){
 const id=c.config.spreadsheetId;if(!/^[A-Za-z0-9_-]{15,200}$/.test(id||''))throw new AppError(400,'Save the Google spreadsheet ID.');const token=await googleAccess(secret);
 return remoteJSON('https://sheets.googleapis.com/v4/spreadsheets/'+id+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},body});
}
async function airtable(c,secret,{method='GET',query='',body}={}){
 if(!/^app[A-Za-z0-9]+$/.test(c.config.baseId||''))throw new AppError(400,'Save the Airtable base ID.');
 return remoteJSON('https://api.airtable.com/v0/'+c.config.baseId+'/'+encodeURIComponent(c.config.logTable||'[] Content Log & Deduplication')+query,{method,headers:{authorization:'Bearer '+(secret.token||''),'content-type':'application/json'},body});
}
export async function testMirror(c,secret){
 if(c.provider==='google_sheets'){const result=await sheets(c,secret,'?fields=spreadsheetId,properties(title)');return {ok:true,message:'Google spreadsheet readable: '+result.properties.title};}
 await airtable(c,secret,{query:'?maxRecords=1&fields%5B%5D=Automation%20ID'});return {ok:true,message:'Airtable log table readable. No record was written.'};
}
async function writeMirror(c,secret,post,page,legacyPage){
 const status=legacyStatus[post.status]||'Queued',panel=post.status==='published'?'Published':post.status==='scheduled'?'Scheduled':post.status==='review'?'Review':'Drafts';
 if(c.provider==='airtable'){
  if(!legacyPage)throw new AppError(409,'This Airtable base needs a linked Page record. Import the Page mapping or use Google Sheets for this new Page.');
  await airtable(c,secret,{method:'PATCH',body:{performUpsert:{fieldsToMergeOn:['Automation ID']},records:[{fields:{'Log ID':post.id,'Automation ID':post.id,'Article Hash ID':post.source_hash||post.id,'Linked Page':[legacyPage],'Source Title':post.title,'Source URL':post.source_url||'','Extracted Text Content':post.body,'AI Generated Caption':post.caption,'Media Attachment URLs':post.creative.sourceImage||'',Status:status,'FB Post ID Reference':post.fb_post_id||'','Timestamp Published':post.published_at?new Date(post.published_at).toISOString():null,'Dashboard Panel':panel,'Website Article URL':post.website_url||'','Scheduled At':post.scheduled_at?new Date(post.scheduled_at).toISOString():null}}]}});return;
 }
 const tab=c.config.tab||'EchoLink Posts',meta=await sheets(c,secret,'?fields=sheets(properties(title))');if(!meta.sheets?.some(s=>s.properties.title===tab))throw new AppError(409,'Create the configured logging tab in Google Sheets before enabling this mirror.');
 const range="'"+tab.replaceAll("'","''")+"'!A:U",encoded=encodeURIComponent(range),existing=(await sheets(c,secret,'/values/'+encoded)).values||[];
 if(existing.length&&!sheetHeaders.every((h,i)=>!existing[0][i]&&i>=19||existing[0][i]===h))throw new AppError(409,'Use a dedicated logging tab with the EchoLink headers. Existing data was not overwritten.');
 const matches=existing.map((r,i)=>r[0]===post.id?i+1:0).filter(Boolean);if(matches.length>1)throw new AppError(409,'Duplicate Automation IDs exist in the logging sheet.');const n=matches[0]||Math.max(2,existing.length+1),quoted="'"+tab.replaceAll("'","''")+"'";
 const values=[post.id,page.name,panel,status,post.title,post.source_url||'','',post.caption,post.creative.sourceImage||'','',post.seo.analysis||'','','',post.scheduled_at||'',post.published_at||'',post.fb_post_id||'','Disabled','',post.updated_at,post.website_url||'',post.website_url?'Published':''];
 await sheets(c,secret,'/values:batchUpdate',{method:'POST',body:{valueInputOption:'RAW',data:[...(!existing.length?[{range:quoted+'!A1:U1',values:[sheetHeaders]}]:[]),{range:quoted+'!A'+n+':U'+n,values:[values]}]}});
}
export async function syncOneMirror(){
 const item=await transaction(null,async db=>(await db.query(`UPDATE creator.mirror_outbox SET status='processing',next_attempt_at=now()+interval '5 minutes' WHERE (post_id,connection_id)=(SELECT o.post_id,o.connection_id FROM creator.mirror_outbox o JOIN creator.page_mirrors m ON m.workspace_id=o.workspace_id AND m.connection_id=o.connection_id JOIN creator.posts p ON p.workspace_id=o.workspace_id AND p.id=o.post_id AND p.page_id=m.page_id JOIN creator.workspaces w ON w.id=o.workspace_id JOIN creator.accounts a ON a.id=w.owner_id WHERE o.status IN ('pending','failed','processing') AND o.next_attempt_at<=now() AND m.enabled AND w.status='active' AND a.status='active' ORDER BY o.next_attempt_at FOR UPDATE OF o SKIP LOCKED LIMIT 1) RETURNING *,version::text AS version`)).rows[0],{owner:true});if(!item)return false;
 const w=item.workspace_id;
 try{
  await transaction(w,async db=>{
   // A connection lock prevents concurrent sheet append races across workers.
   await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['mirror:'+item.connection_id]);
   const post=(await db.query('SELECT * FROM creator.posts WHERE workspace_id=$1 AND id=$2',[w,item.post_id])).rows[0],page=(await db.query('SELECT * FROM creator.pages WHERE workspace_id=$1 AND id=$2',[w,post.page_id])).rows[0],c=(await db.query('SELECT * FROM creator.connections WHERE workspace_id=$1 AND id=$2',[w,item.connection_id])).rows[0];
   const mapping=(await db.query("SELECT source_id FROM creator.legacy_imports WHERE workspace_id=$1 AND source='legacy-live' AND kind='page' AND resource_id=$2",[w,page.id])).rows[0];
   await writeMirror(c,decryptSecret(c.secret_cipher,w),post,page,mapping?.source_id);
   await db.query("UPDATE creator.mirror_outbox SET status='synced',last_error=NULL WHERE workspace_id=$1 AND post_id=$2 AND connection_id=$3 AND version=$4",[w,item.post_id,item.connection_id,item.version]);
  });
 }catch(error){await transaction(w,db=>db.query("UPDATE creator.mirror_outbox SET status='failed',attempts=attempts+1,next_attempt_at=now()+interval '15 minutes',last_error=$5 WHERE workspace_id=$1 AND post_id=$2 AND connection_id=$3 AND version=$4",[w,item.post_id,item.connection_id,item.version,error instanceof AppError?error.message:'Mirror delivery failed. Test the connection and verify its logging schema.']));}
 return true;
}
