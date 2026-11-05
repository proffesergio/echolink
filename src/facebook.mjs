import {HttpError} from './net.mjs';
import {query} from './db.mjs';
import {createHash} from 'node:crypto';
const connectionCache=new Map();
export function facebookFailure({code,subcode,message=''}){
  const missing=[...new Set(String(message).match(/pages_manage_posts|pages_manage_engagement|pages_read_engagement/g)||[])];
  if(missing.length)return `Facebook permission missing or unavailable: ${missing.join(', ')}. Regenerate the Page token with these permissions in Graph API Explorer; check the app use case/App Review if unavailable. No post was sent.`;
  if(code===190&&subcode===463)return 'Facebook Page token expired (190/463). Reconnect using a fresh User authorization and the long-lived Page token setup; then test the connection.';
  if(code===190&&subcode===460)return 'Facebook authorization was invalidated by a password or security change (190/460). Authorize the Meta app again and reconnect this Page.';
  if(code===190)return 'Facebook token expired or invalid (code 190). Reconnect the Page and test the connection before retrying.';
  if([10,200].includes(code))return `Facebook denied Page publishing permissions (code ${code}${subcode?', subcode '+subcode:''}). Test the Page token permissions and Page access before retrying.`;
  if(code===368)return 'Facebook temporarily restricted this action (code 368). Resolve the restriction with Meta; do not repeatedly retry.';
  if([100,324].includes(code))return `Facebook rejected the selected media or request parameters (code ${code}). Check that the photo URL is public and points to a supported image. No text-only fallback was sent.`;
  return `Facebook rejected publication${code?' (code '+code+')':''}. Test Page permissions and inspect the selected media before retrying.`;
}
export async function checkFacebookConnection(page,fetcher=fetch){
  const token=JSON.parse(process.env.FB_TOKENS_JSON||'{}')[page.fbSecret],version=process.env.META_GRAPH_VERSION;
  if(!token||!/^v\d+\.\d+$/.test(version||''))return {ok:false,publishReady:false,reason:'Save the Page token and Graph API version first'};
  const key=createHash('sha256').update(token+'|'+version+'|'+page.fbPageId).digest('hex'),cached=connectionCache.get(key);
  if(cached?.expires>Date.now())return cached.value;
  const base='https://graph.facebook.com/'+version,headers={Authorization:'Bearer '+token};
  const get=async path=>{const r=await fetcher(base+path,{headers,redirect:'error',signal:AbortSignal.timeout(15000)});const j=await r.json();if(!r.ok||j.error)throw new FacebookError(r.status,{code:j.error?.code,subcode:j.error?.error_subcode,diagnostic:facebookFailure({code:j.error?.code,subcode:j.error?.error_subcode,message:j.error?.message})});return j;};
  const identity=await get('/me?fields=id,name');
  if(String(identity.id)!==String(page.fbPageId))return {ok:false,publishReady:false,reason:'This Page token belongs to a different Facebook Page. Save the matching Page ID/token pair.'};
  const {data}=await get('/debug_token?input_token='+encodeURIComponent(token));
  const scopes=Array.isArray(data?.scopes)?data.scopes.filter(s=>/^pages_[a-z_]+$/.test(s)):[];
  const missing=['pages_read_engagement','pages_manage_posts'].filter(s=>!scopes.includes(s)),commentsReady=scopes.includes('pages_manage_engagement');
  const valid=data?.is_valid===true&&data?.type==='PAGE';
  const toDate=value=>Number.isFinite(value)&&value>0?new Date(value*1000).toISOString():null;
  const value={ok:valid&&!missing.length,publishReady:valid&&!missing.length,commentsReady,id:identity.id,name:identity.name,scopes,missing,
    expiryKnown:Number.isFinite(data?.expires_at),noScheduledExpiry:data?.expires_at===0,expiresAt:toDate(data?.expires_at),dataAccessExpiresAt:toDate(data?.data_access_expires_at),verifiedAt:new Date().toISOString(),
    reason:!valid?'Save a valid Page access token, not a User token':missing.length?'Missing '+missing.join(', ')+'. Regenerate the Page token with publishing permissions; identity access alone cannot publish.':!commentsReady?'Publishing permission verified; add pages_manage_engagement for source comments':'Page identity, publishing and source-comment permissions verified'};
  connectionCache.set(key,{value,expires:Date.now()+60000});if(connectionCache.size>100)connectionCache.delete(connectionCache.keys().next().value);
  return value;
}

export class FacebookError extends HttpError {
  constructor(status,{code,subcode,diagnostic,retryAfter=0,rateLimited=false,paused=false}={}){
    super(status);this.code=code;this.subcode=subcode;this.diagnostic=diagnostic||facebookFailure({code,subcode});this.retryAfter=retryAfter;this.rateLimited=rateLimited;this.paused=paused;
  }
}
export function responsePolicy(response,data={},now=Date.now()){
  const code=Number(data.error?.code)||null;
  const raw=response.headers.get('retry-after');
  let seconds=raw?Number(raw):0;
  if(raw&&!Number.isFinite(seconds))seconds=Math.max(0,(Date.parse(raw)-now)/1000)||0;
  let highUsage=false,global=false;
  for(const name of ['x-app-usage','x-page-usage','x-business-use-case-usage']){
    try{
      const inspect=value=>{if(!value||typeof value!=='object')return;for(const [k,v] of Object.entries(value)){if(['call_count','total_cputime','total_time'].includes(k)&&Number(v)>=90)highUsage=true;if(k==='estimated_time_to_regain_access')seconds=Math.max(seconds,Number(v)*60||0);if(typeof v==='object')inspect(v);}};
      const usage=JSON.parse(response.headers.get(name)||'{}');inspect(usage);
      if(name==='x-app-usage'&&['call_count','total_cputime','total_time'].some(k=>Number(usage[k])>=90))global=true;
    }catch{/* A malformed usage header never changes delivery confirmation. */}
  }
  const rateLimited=response.status===429||[4,17,32,613].includes(code)||(code>=80000&&code<=80014);
  const paused=[10,190,200,368].includes(code);
  return {code,rateLimited,paused,global:global||code===4,retryAfter:Math.ceil(Math.max(0,seconds,rateLimited?900:highUsage?300:0))};
}
export async function deliveryGate(pageId){
  const rows=(await query("SELECT * FROM echolink.facebook_delivery WHERE page_id IN ($1,'__global__') ORDER BY cooldown_until DESC NULLS LAST",[pageId])).rows;
  const row=rows.find(r=>r.paused_reason)||rows[0];
  if(row?.paused_reason)return {ready:false,reason:row.paused_reason};
  if(row?.cooldown_until&&new Date(row.cooldown_until)>new Date())return {ready:false,reason:'Facebook cooldown until '+new Date(row.cooldown_until).toISOString()};
  return {ready:true};
}
export async function clearDeliveryPause(pageId){
  // Explicit operator acknowledgement only; keep a server-requested cooldown.
  await query('UPDATE echolink.facebook_delivery SET paused_reason=NULL,last_code=NULL,updated_at=now() WHERE page_id=$1',[pageId]);
}
export async function clearConnectionPause(pageId){
  await query('UPDATE echolink.facebook_delivery SET paused_reason=NULL,last_code=NULL,updated_at=now() WHERE page_id=$1 AND last_code IN (10,190,200)',[pageId]);
}
export async function graphRequest(pageId,url,options={},_policy={},fetcher=fetch){
  const endpoint=new URL(url);
  if(endpoint.protocol!=='https:'||endpoint.hostname!=='graph.facebook.com'||endpoint.username||endpoint.password)throw new Error('Invalid Facebook endpoint');
  const response=await fetcher(endpoint,{...options,redirect:'error',signal:AbortSignal.timeout(45000)});
  // Discard upstream prose: error bodies can contain credentials or user data.
  const raw=await response.text();if(raw.length>2000000)throw new Error('Facebook response too large');
  let data;try{data=JSON.parse(raw);}catch{throw new Error('Invalid Facebook response; reconcile before retrying');}
  const rule=responsePolicy(response,data);
  const subcode=Number(data.error?.error_subcode)||null,diagnostic=facebookFailure({code:rule.code,subcode,message:data.error?.message});
  const reason=rule.paused?diagnostic:null;
  // Failure to persist the gate after a write remains an unknown outcome.
  await query(`INSERT INTO echolink.facebook_delivery(page_id,cooldown_until,paused_reason,last_code,last_request_at)
    VALUES($1,CASE WHEN $2::double precision>0 THEN now()+($2::double precision*interval '1 second') END,$3,$4,now())
    ON CONFLICT(page_id) DO UPDATE SET cooldown_until=GREATEST(echolink.facebook_delivery.cooldown_until,EXCLUDED.cooldown_until),paused_reason=COALESCE(EXCLUDED.paused_reason,echolink.facebook_delivery.paused_reason),last_code=EXCLUDED.last_code,last_request_at=now(),updated_at=now()`,[pageId,rule.retryAfter,reason,rule.code]);
  if(rule.global)await query(`INSERT INTO echolink.facebook_delivery(page_id,cooldown_until,last_code) VALUES('__global__',now()+($1::double precision*interval '1 second'),$2)
    ON CONFLICT(page_id) DO UPDATE SET cooldown_until=GREATEST(echolink.facebook_delivery.cooldown_until,EXCLUDED.cooldown_until),last_code=EXCLUDED.last_code,updated_at=now()`,[rule.retryAfter,rule.code]);
  if(!response.ok||data.error)throw new FacebookError(response.status,{...rule,subcode,diagnostic});
  return data;
}
