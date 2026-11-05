import test from 'node:test';
import assert from 'node:assert/strict';
import platform from '../deploy/vercel/api/platform.mjs';
test('creator proxy preserves OAuth queries, private cookies and binary assets while rejecting foreign mutations',async()=>{
 const prior={fetch:globalThis.fetch,origin:process.env.DASHBOARD_PUBLIC_ORIGIN,worker:process.env.WORKER_ORIGIN,key:process.env.WORKER_BRIDGE_TOKEN};
 process.env.DASHBOARD_PUBLIC_ORIGIN='https://echolinkbd.vercel.app';process.env.WORKER_ORIGIN='https://worker.example.com';process.env.WORKER_BRIDGE_TOKEN='fixture-bridge-key-'.repeat(3);let captured;
 const call=async(path,method='GET',origin,body)=>{const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},end(v){this.body=v;}};await platform({url:'/api/platform?path='+path,headers:{cookie:'private=session',...(origin?{origin}:{})},method,body},res);return res;};
 try{
  globalThis.fetch=async(url,options)=>{captured={url:new URL(url),options};return new Response(null,{status:302,headers:{location:'https://echolinkbd.vercel.app/','set-cookie':'session=fixture; HttpOnly; Secure; SameSite=Lax'}});};
  const redirect=await call('auth/callback/google&code=fixture-code&state=fixture-state');assert.equal(redirect.statusCode,302);assert.equal(captured.url.pathname,'/api/auth/callback/google');assert.equal(captured.url.searchParams.get('code'),'fixture-code');assert.equal(captured.url.searchParams.has('path'),false);assert.equal(captured.options.headers.cookie,'private=session');assert.match(redirect.headers['set-cookie'][0],/HttpOnly/);
  globalThis.fetch=async()=>new Response(Buffer.from([255,216,255,1]),{headers:{'content-type':'image/jpeg'}});const asset=await call('assets/fixture');assert.deepEqual(asset.body,Buffer.from([255,216,255,1]));
  assert.equal((await call('pages','PUT','https://attacker.example',{})).statusCode,403);assert.equal((await call('../internal/platform/tick')).statusCode,404);
  globalThis.fetch=async()=>{throw new Error('private diagnostic');};const offline=await call('public');assert.equal(offline.statusCode,503);assert.match(offline.body,/platform:repair/);assert(!offline.body.includes('private diagnostic'));
 }finally{globalThis.fetch=prior.fetch;for(const [key,value]of Object.entries({DASHBOARD_PUBLIC_ORIGIN:prior.origin,WORKER_ORIGIN:prior.worker,WORKER_BRIDGE_TOKEN:prior.key})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
