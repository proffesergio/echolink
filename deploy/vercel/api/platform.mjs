// Only the authenticated bridge is public. Database and provider secrets stay
// with the Windows worker; cookies and OAuth redirects retain the site origin.
import {workerOrigin} from '../lib/worker-route.mjs';
export const config={api:{bodyParser:false}};
const fail=(res,status,error)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error}));};
export default async function platform(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  const incoming=new URL(req.url,'https://proxy.invalid'),path=req.query?.path||incoming.searchParams.get('path')||'';
  if(typeof path!=='string'||!/^\/?[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*\/?$/.test(path)||path.includes('..'))return fail(res,404,'Unknown application endpoint.');
  if(!['GET','HEAD','POST','PUT','DELETE','PATCH'].includes(req.method))return fail(res,405,'Method not allowed.');
  const origin=process.env.DASHBOARD_PUBLIC_ORIGIN,worker=await workerOrigin(process.env.WORKER_ORIGIN),key=process.env.WORKER_BRIDGE_TOKEN;
  if(!origin||!worker||!key||key.length<32)return fail(res,503,'The workspace service is temporarily unavailable. Please try again shortly.');
  const publicURL=new URL(origin),target=new URL(worker);
  if(publicURL.protocol!=='https:'||publicURL.origin!==origin||target.protocol!=='https:'||target.origin!==worker||target.username||target.password)return fail(res,503,'The workspace service could not be reached. Please try again shortly.');
  if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==origin&&path!=='billing/stripe-webhook')return fail(res,403,'Submit this request from the EchoLink application.');
  target.pathname='/api/'+path.replace(/^\//,'');incoming.searchParams.delete('path');target.search=incoming.search;
  const headers={'x-echolink-bridge-key':key,accept:req.headers.accept||'application/json'};
  for(const name of ['origin','cookie','content-type','x-workspace-id','stripe-signature','user-agent'])if(req.headers[name])headers[name]=req.headers[name];
  if(process.env.CF_ACCESS_CLIENT_ID&&process.env.CF_ACCESS_CLIENT_SECRET){headers['CF-Access-Client-Id']=process.env.CF_ACCESS_CLIENT_ID;headers['CF-Access-Client-Secret']=process.env.CF_ACCESS_CLIENT_SECRET;}
  const bodyLimit=path.replace(/^\//,'')==='brand-fonts'?3_000_000:1_000_000;
  let body;
  if(!['GET','HEAD'].includes(req.method)){
   if(req.body!==undefined)body=Buffer.isBuffer(req.body)?req.body:Buffer.from(typeof req.body==='string'?req.body:JSON.stringify(req.body));
   else{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>bodyLimit)return fail(res,413,'This request is too large.');chunks.push(chunk);}body=Buffer.concat(chunks);}
   if(body.length>bodyLimit)return fail(res,413,'This request is too large.');
  }
  let response;try{response=await fetch(target,{method:req.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(55000)});}catch{return fail(res,503,'Your workspace is reconnecting. Please try again shortly, or explore the demo while you wait.');}
  const type=response.headers.get('content-type')||'';
  if(response.status>=500&&!type.includes('application/json'))return fail(res,503,'Your workspace is reconnecting. Please try again shortly, or explore the demo while you wait.');
  res.statusCode=response.status;
  for(const name of ['content-type','location','retry-after'])if(response.headers.has(name))res.setHeader(name,response.headers.get(name));
  const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>16_000_000)return fail(res,502,'The worker response is too large.');
  res.end(req.method==='HEAD'?undefined:bytes);
 }catch{return fail(res,503,'The workspace service is temporarily unavailable. Please try again shortly.');}
}
