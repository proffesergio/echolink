import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {timingSafeEqual} from 'node:crypto';
import {getAuth} from './identity.mjs';
import {api} from './api.mjs';
import {stripeWebhook} from './billing.mjs';
import {AppError} from './errors.mjs';
import {env} from './env.mjs';
import {recoverExpiredTasks,startWorker,tickAutomations} from './jobs.mjs';
import {closeDatabase} from './db.mjs';
const root=fileURLToPath(new URL('../dist/',import.meta.url)),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const security={'x-content-type-options':'nosniff','referrer-policy':'same-origin','x-frame-options':'DENY','cache-control':'no-store','content-security-policy':"default-src 'self'; img-src 'self' https: data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self' https://checkout.stripe.com"};
async function readBody(req){const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>1_000_000)throw new AppError(413,'This request is too large.');chunks.push(chunk);}return Buffer.concat(chunks);}
export function createApp(){return createServer(async(req,res)=>{
 try{
  const expected=new URL(env().origin),host=req.headers.host;if(env().production&&host==='localhost:'+env().port){res.writeHead(302,{location:env().origin+req.url,'cache-control':'no-store'});res.end();return;}if(![expected.host,'127.0.0.1:'+env().port].includes(host))throw new AppError(400,'Unrecognized application host.');
  const url=new URL(req.url,env().origin),method=req.method;let response;
  if(url.pathname==='/api/health'&&method==='GET')response=Response.json({ok:true,app:'EchoLink',version:2,publishingEnabled:env().publishing});
  else if(url.pathname==='/internal/platform/tick'&&method==='POST'){
   const expected=process.env.PLATFORM_WORKER_TOKEN||'',actual=String(req.headers['x-echolink-worker-key']||'');
   if(expected.length<32||actual.length!==expected.length||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))throw new AppError(401,'Worker authentication required.');
   await readBody(req);response=Response.json(await tickAutomations());
  }else if(url.pathname.startsWith('/api/')){
   const raw=method==='GET'||method==='HEAD'?undefined:await readBody(req),headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
   const request=new Request(url,{method,headers,...(raw?.length?{body:raw}:{} )});
   if(url.pathname.startsWith('/api/auth/'))response=await getAuth().handler(request);
   else if(url.pathname==='/api/billing/stripe-webhook'&&method==='POST')response=Response.json(await stripeWebhook(raw,headers.get('stripe-signature')));
   else{
    if(!['GET','HEAD'].includes(method)&&headers.get('origin')!==env().origin)throw new AppError(403,'Refresh this page and submit from the EchoLink application.','invalid_origin');
    let body={};if(raw?.length){try{body=JSON.parse(raw.toString());}catch{throw new AppError(400,'The request body must be valid JSON.');}}
    const result=await api(request,url.pathname,body);response=result instanceof Response?result:Response.json(result);
   }
  }else{
   if(method!=='GET'&&method!=='HEAD')throw new AppError(405,'Use GET for application pages.');
   let file=resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==resolve(root)&&!file.startsWith(resolve(root)+sep)||url.pathname.includes('..'))throw new AppError(404,'Page not found.');
   try{if(!(await stat(file)).isFile())file=resolve(root,'index.html');}catch{file=resolve(root,'index.html');}
   response=new Response(await readFile(file),{headers:{'content-type':mime[extname(file)]||'application/octet-stream'}});
  }
  res.writeHead(response.status,{...security,...Object.fromEntries(response.headers),...(response.headers.getSetCookie().length?{'set-cookie':response.headers.getSetCookie()}:{})});res.end(method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()));
 }catch(error){const status=error instanceof AppError?error.status:error.code==='23505'?409:error.code==='23503'?404:500;const message=error instanceof AppError?error.message:error.code==='23505'?'This item or reference already exists.':error.code==='23503'?'The related item was not found in your workspace.':'The operation could not be completed. Please retry or contact the owner.';
  if(status===500)console.error('Platform request failed:',error.code||error.name);
  res.writeHead(status,{...security,'content-type':'application/json'});res.end(JSON.stringify({error:message,code:error instanceof AppError?error.code:undefined}));
 }
});}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 await recoverExpiredTasks();const stop=startWorker(),server=createApp();server.listen(env().port,'127.0.0.1',()=>console.log('EchoLink creator platform: '+env().origin+' (live publishing '+(env().publishing?'enabled':'disabled')+')'));
 const shutdown=()=>{stop();server.close(async()=>{await closeDatabase();process.exit(0);});};process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
}
