import {lookup} from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';
import {request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {AppError} from './errors.mjs';
const blocked=new BlockList();
const globalIPv6=new BlockList();globalIPv6.addSubnet('2000::',3,'ipv6');
for(const [ip,prefix]of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['192.0.0.0',24],['192.0.2.0',24],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])blocked.addSubnet(ip,prefix,'ipv4');
for(const [ip,prefix]of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8],['2001:db8::',32],['2001::',32],['2002::',16]])blocked.addSubnet(ip,prefix,'ipv6');
export function privateAddress(address){const value=address.replace(/^\[|\]$/g,'');if(value.toLowerCase().startsWith('::ffff:'))return true;const family=isIP(value);return !family||family===6&&!globalIPv6.check(value,'ipv6')||blocked.check(value,family===6?'ipv6':'ipv4');}
export function publicURL(value){let url;try{url=new URL(value);}catch{throw new AppError(400,'Enter a complete HTTPS URL.');}if(url.protocol!=='https:'||url.username||url.password||url.hash||['localhost','metadata.google.internal'].includes(url.hostname)||isIP(url.hostname.replace(/^\[|\]$/g,''))&&privateAddress(url.hostname))throw new AppError(400,'Use a public HTTPS URL without embedded credentials.');return url;}
export async function outbound(value,{method='GET',headers={},body,localOrigin,maxBytes=2_000_000,timeout=30000,signal}={}){
  const deadline=AbortSignal.timeout(timeout);signal=signal?AbortSignal.any([signal,deadline]):deadline;
  const failure=error=>error instanceof AppError?error:signal?.aborted&&signal.reason instanceof AppError?signal.reason:signal?.reason?.name==='TimeoutError'?new AppError(504,'The connected service exceeded its response time budget.'):new AppError(502,'The remote service could not be reached. Check the connection and try again.');
  const url=localOrigin?new URL(value):publicURL(value);
  if(localOrigin&&url.origin!==localOrigin)throw new AppError(400,'Local requests must use the operator-configured provider origin.');
  const addresses=await lookup(url.hostname.replace(/^\[|\]$/g,''),{all:true});
  if(!addresses.length||!localOrigin&&addresses.some(a=>privateAddress(a.address)))throw new AppError(400,'Private network destinations are not allowed.');
  const chosen=addresses[0];
  const payload=body===undefined||body===null?undefined:Buffer.isBuffer(body)?body:Buffer.from(typeof body==='string'?body:JSON.stringify(body));
  // Pin the resolved public IP for this request; do not resolve again between
  // validation and connection. TLS still verifies the original hostname.
  return new Promise((resolve,reject)=>{
    const request=(url.protocol==='https:'?httpsRequest:httpRequest)(url,{method,signal,headers:{...headers,...(payload?{'content-length':String(payload.length)}:{})},agent:false,lookup:(_host,options,callback)=>options?.all?callback(null,[chosen]):callback(null,chosen.address,chosen.family)},response=>{
      if(response.statusCode>=300&&response.statusCode<400){response.resume();reject(new AppError(400,'The source redirected. Save its final public URL and try again.'));return;}
      const chunks=[];let length=0;response.on('data',chunk=>{length+=chunk.length;if(length>maxBytes){response.destroy();reject(new AppError(413,'The remote response exceeds the allowed size.'));}else chunks.push(chunk);});
      response.on('end',()=>resolve({ok:response.statusCode>=200&&response.statusCode<300,status:response.statusCode,headers:response.headers,bytes:Buffer.concat(chunks)}));
      response.on('error',error=>reject(failure(error)));
    });
    request.setTimeout(timeout,()=>request.destroy(new AppError(504,'The connected service exceeded its response time budget.')));request.on('error',error=>reject(failure(error)));
    if(payload)request.write(payload);request.end();
  });
}
export async function remoteJSON(url,options){const r=await outbound(url,options);let data;try{data=JSON.parse(r.bytes.toString());}catch{throw new AppError(502,'The connected service returned an invalid JSON response.');}if(!r.ok){if(options?.localOrigin&&r.status===400&&typeof data.error==='string'){const context=data.error.match(/request \((\d+) tokens\) exceeds the available context size \((\d+) tokens\)/);if(context)throw new AppError(422,'The local input needs '+context[1]+' tokens but this model connection allows '+context[2]+'. Shorten the source brief or select a larger context on a capable inference host.','inference_context_limit');}const meta=new URL(url).hostname==='graph.facebook.com'&&Number.isInteger(data.error?.code)?' Meta code '+data.error.code+(data.error.error_subcode?'/'+data.error.error_subcode:'')+'.':'';const code=Number(data.error?.code),subcode=Number(data.error?.error_subcode),auth=new URL(url).hostname==='graph.facebook.com'&&code===190;const error=new AppError(auth?401:502,auth?'Facebook token expired or revoked (190/'+(subcode||0)+'). Open this Page’s Facebook connection and reconnect with fresh authorization.':'The connected service rejected the request (HTTP '+r.status+').'+meta+' Check its credentials, model and permissions.',auth?'facebook_auth_expired':'request_failed');error.metaCode=code;error.metaSubcode=subcode;error.upstreamStatus=r.status;error.definiteRejection=r.status>=400&&r.status<500&&!!data.error;throw error;}return data;}
