import {HttpError} from './net.mjs';
import {query} from './db.mjs';

export class FacebookError extends HttpError {
  constructor(status,{code,retryAfter=0,rateLimited=false,paused=false}={}){
    super(status);this.code=code;this.retryAfter=retryAfter;this.rateLimited=rateLimited;this.paused=paused;
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
export async function graphRequest(pageId,url,options={},_policy={},fetcher=fetch){
  const endpoint=new URL(url);
  if(endpoint.protocol!=='https:'||endpoint.hostname!=='graph.facebook.com'||endpoint.username||endpoint.password)throw new Error('Invalid Facebook endpoint');
  const response=await fetcher(endpoint,{...options,redirect:'error',signal:AbortSignal.timeout(45000)});
  // Discard upstream prose: error bodies can contain credentials or user data.
  const raw=await response.text();if(raw.length>2000000)throw new Error('Facebook response too large');
  let data;try{data=JSON.parse(raw);}catch{throw new Error('Invalid Facebook response; reconcile before retrying');}
  const rule=responsePolicy(response,data);
  const reason=rule.paused?'Facebook publishing paused (code '+rule.code+'). Repair credentials/permissions or resolve the Page restriction, then acknowledge Resume in the dashboard.':null;
  // Failure to persist the gate after a write remains an unknown outcome.
  await query(`INSERT INTO echolink.facebook_delivery(page_id,cooldown_until,paused_reason,last_code,last_request_at)
    VALUES($1,CASE WHEN $2::double precision>0 THEN now()+($2::double precision*interval '1 second') END,$3,$4,now())
    ON CONFLICT(page_id) DO UPDATE SET cooldown_until=GREATEST(echolink.facebook_delivery.cooldown_until,EXCLUDED.cooldown_until),paused_reason=COALESCE(EXCLUDED.paused_reason,echolink.facebook_delivery.paused_reason),last_code=EXCLUDED.last_code,last_request_at=now(),updated_at=now()`,[pageId,rule.retryAfter,reason,rule.code]);
  if(rule.global)await query(`INSERT INTO echolink.facebook_delivery(page_id,cooldown_until,last_code) VALUES('__global__',now()+($1::double precision*interval '1 second'),$2)
    ON CONFLICT(page_id) DO UPDATE SET cooldown_until=GREATEST(echolink.facebook_delivery.cooldown_until,EXCLUDED.cooldown_until),last_code=EXCLUDED.last_code,updated_at=now()`,[rule.retryAfter,rule.code]);
  if(!response.ok||data.error)throw new FacebookError(response.status,{...rule});
  return data;
}
