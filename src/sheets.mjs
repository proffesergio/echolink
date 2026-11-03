import {createSign,createHash,createPrivateKey} from 'node:crypto';
import {query,transaction} from './db.mjs';
import {jsonRequest} from './net.mjs';
import {contentPanel} from './newsroom.mjs';
let cached;
export const sheetHeaders=['Automation ID','Page','Panel','Status','Source title','Source URL','Source published at','Caption','Image URL','Image suggestion','Analysis','Selection score','Selection reason','Scheduled at','Published at','FB post ID','Comment status','Comment ID','Updated at'];
export function validateGoogleCredentials(value){
  const c=typeof value==='string'?JSON.parse(value):value;
  if(c?.type!=='service_account'||!String(c.client_email||'').endsWith('.gserviceaccount.com')||typeof c.private_key!=='string'||createPrivateKey(c.private_key).asymmetricKeyType!=='rsa')throw new Error('Provide a Google service-account JSON key');
  return c;
}
export function sheetsConfiguration(){
  let email='';try{email=JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON||'{}').client_email||'';}catch{}
  return {spreadsheetId:process.env.GOOGLE_SHEET_ID||'',tab:process.env.GOOGLE_SHEET_TAB||'EchoLink Posts',credentialsConfigured:!!process.env.GOOGLE_SERVICE_ACCOUNT_JSON,serviceEmail:email,configured:!!process.env.GOOGLE_SHEET_ID&&!!process.env.GOOGLE_SERVICE_ACCOUNT_JSON};
}
async function accessToken(){
  const raw=process.env.GOOGLE_SERVICE_ACCOUNT_JSON,identity=createHash('sha256').update(raw||'').digest('hex');
  if(cached?.identity===identity&&cached.expires>Date.now())return cached.token;
  const c=validateGoogleCredentials(raw),iat=Math.floor(Date.now()/1000),enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
  const message=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:c.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat,exp:iat+3600});
  const signature=createSign('RSA-SHA256').update(message).sign(c.private_key,'base64url');
  const data=await jsonRequest('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:message+'.'+signature}).toString()},{hosts:['oauth2.googleapis.com'],timeoutMs:15000});
  if(!data.access_token)throw new Error('Google authorization failed');
  cached={identity,token:data.access_token,expires:Date.now()+Math.min(3300,Number(data.expires_in)||3300)*1000};return cached.token;
}
async function api(path,body,method){
  const id=process.env.GOOGLE_SHEET_ID;if(!/^[A-Za-z0-9_-]{15,200}$/.test(id||''))throw new Error('Invalid spreadsheet ID');
  return jsonRequest(`https://sheets.googleapis.com/v4/spreadsheets/${id}${path}`,{method:method||(body?'POST':'GET'),headers:{Authorization:'Bearer '+await accessToken(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})},{hosts:['sheets.googleapis.com'],timeoutMs:15000});
}
export async function testSheet(){const data=await api('?fields=spreadsheetId,properties(title),sheets(properties(title))');return {ok:true,title:data.properties.title,tabs:data.sheets.map(s=>s.properties.title),...sheetsConfiguration()};}
export function sheetRow(a){const iso=v=>v?new Date(v).toISOString():'';return [a.id,a.page_name||a.page_id,contentPanel(a),a.status,a.title,a.source_url,iso(a.source_published_at),a.caption||'',a.image_url||'',a.image_prompt||'',a.analysis||'',a.selection_score??'',a.selection_reason||'',iso(a.scheduled_at),iso(a.published_at),a.fb_post_id||'',a.comment_status||'',a.comment_id||'',iso(a.updated_at)];}
export function sheetWrites(existing,articles,tab){
  const ids=new Map();existing.slice(1).forEach((r,i)=>{if(r[0]){if(ids.has(r[0]))throw new Error('Duplicate Automation IDs in sheet');ids.set(r[0],i+2);}});
  let next=existing.length+1;const quote="'"+tab.replaceAll("'","''")+"'";
  return articles.map(a=>({range:`${quote}!A${ids.get(a.id)||next++}:S${ids.get(a.id)||next-1}`,values:[sheetRow(a)]}));
}
export async function syncSheet(){
  if(!sheetsConfiguration().configured)return {configured:false,skipped:'Connect a spreadsheet in Connections to enable logging'};
  try{return await transaction(async client=>{
    const lock=await client.query("SELECT pg_try_advisory_xact_lock(hashtextextended('echolink:sheets',0)) AS acquired");
    if(!lock.rows[0].acquired)return {busy:true};
    const tab=process.env.GOOGLE_SHEET_TAB||'EchoLink Posts';
    const meta=await api('?fields=sheets(properties(title))');
    if(!meta.sheets.some(s=>s.properties.title===tab))await api(':batchUpdate',{requests:[{addSheet:{properties:{title:tab}}}]});
    const range="'"+tab.replaceAll("'","''")+"'!A:S";
    const existing=(await api('/values/'+encodeURIComponent(range))).values||[];
    if(existing.length&&JSON.stringify(existing[0])!==JSON.stringify(sheetHeaders))throw new Error('Use a dedicated EchoLink tab with the expected header');
    const rows=(await query("SELECT a.*,a.updated_at::text AS version,c.status AS comment_status,c.remote_id AS comment_id,p.config->>'name' AS page_name FROM echolink.articles a LEFT JOIN echolink.sheet_sync s ON s.article_id=a.id LEFT JOIN echolink.source_comments c ON c.article_id=a.id LEFT JOIN echolink.configurations p ON p.kind='page' AND p.id=a.page_id WHERE s.version IS DISTINCT FROM a.updated_at ORDER BY a.updated_at LIMIT 200")).rows;
    const data=sheetWrites(existing.length?existing:[sheetHeaders],rows,tab);
    if(!existing.length)data.unshift({range:range.replace('A:S','A1:S1'),values:[sheetHeaders]});
    if(data.length)await api('/values:batchUpdate',{valueInputOption:'RAW',data});
    for(const a of rows)await query('INSERT INTO echolink.sheet_sync(article_id,version) VALUES($1,$2::timestamptz) ON CONFLICT(article_id) DO UPDATE SET version=excluded.version,synced_at=now()',[a.id,a.version]);
    return {configured:true,synced:rows.length};
  },{coordination:true});}catch{return {configured:true,failed:true,error:'Google Sheets sync failed. Check sheet sharing, enabled API, credentials, and the dedicated tab header. Retry sync after fixing the connection.'};}
}
