import {test} from 'node:test';
import assert from 'node:assert/strict';
import proxy from '../deploy/vercel/api/proxy.mjs';
import app from '../src/app.mjs';
test('Vercel proxy forwards signed sessions and rejects foreign origins and worker-job routes',async()=>{
  const saved={...process.env},originalFetch=globalThis.fetch;
  Object.assign(process.env,{WORKER_ORIGIN:'https://worker.example.test',DASHBOARD_PUBLIC_ORIGIN:'https://dashboard.example.test',DASHBOARD_PASSWORD:'test proxy password',WORKER_API_KEY:'k'.repeat(40),CF_ACCESS_CLIENT_ID:'test-client',CF_ACCESS_CLIENT_SECRET:'test-secret'});
  const calls=[];
  process.env.WORKER_BRIDGE_TOKEN='bridge-key-for-proxy-test';
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return app.fetch(new Request(String(url),options));};
  const request=async(path,body,headers={})=>{
    const res={statusCode:200,headers:{},setHeader(name,value){this.headers[name]=value;},end(value){this.body=JSON.parse(value);}};
    await proxy({url:'/api/proxy?path='+path,method:body?'POST':'GET',body,headers:{...(body?{origin:process.env.DASHBOARD_PUBLIC_ORIGIN}:{}),...headers}},res);return res;
  };
  try{
    assert.equal((await request('auth')).body.passwordConfigured,true);
    const accepted=await request('login',{password:'test proxy password'});assert.equal(accepted.statusCode,200);
    const cookie=accepted.headers['Set-Cookie'][0];assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);
    assert.equal((await request('auth',undefined,{cookie})).body.authenticated,true);
    assert.equal(calls.at(-1).options.headers['CF-Access-Client-Secret'],'test-secret');
    assert.equal(calls.at(-1).options.headers['X-EchoLink-Bridge-Key'],'bridge-key-for-proxy-test');
    assert.equal((await request('login',{password:'test proxy password'},{origin:'https://attacker.example'})).statusCode,403);
    assert.equal((await request('ticket',{})).statusCode,404);
    assert.equal((await request('../../jobs/process',{})).statusCode,404);
    assert.equal((await request('login',{password:'x'.repeat(131073)})).statusCode,413);
    globalThis.fetch=async()=>{throw Object.assign(new Error('Private endpoint detail'),{cause:{code:'ENOTFOUND'}});};
    const offline=await request('auth');assert.equal(offline.statusCode,502);assert.match(offline.body.error,/public:repair/);assert.ok(!offline.body.error.includes('Private endpoint detail'));
    globalThis.fetch=async()=>{throw Object.assign(new Error('private'),{name:'TimeoutError'});};
    assert.equal((await request('auth')).statusCode,504);
    delete process.env.WORKER_ORIGIN;assert.match((await request('auth')).body.error,/settings are missing/);
    process.env.WORKER_ORIGIN='http://localhost:8787';assert.equal((await request('auth')).statusCode,502);
  }finally{
    globalThis.fetch=originalFetch;
    if(saved.WORKER_BRIDGE_TOKEN===undefined)delete process.env.WORKER_BRIDGE_TOKEN;else process.env.WORKER_BRIDGE_TOKEN=saved.WORKER_BRIDGE_TOKEN;
    for(const key of ['WORKER_ORIGIN','DASHBOARD_PUBLIC_ORIGIN','DASHBOARD_PASSWORD','WORKER_API_KEY','CF_ACCESS_CLIENT_ID','CF_ACCESS_CLIENT_SECRET'])if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];
  }
});
