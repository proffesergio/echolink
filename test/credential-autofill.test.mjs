import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import app from '../src/app.mjs';
import {issueSession,passwordHash} from '../src/admin-auth.mjs';

test('autofilled owner passwords cannot replace n8n credentials in memory or on disk',async()=>{
  const before=process.cwd(),keys=['DASHBOARD_PASSWORD','DASHBOARD_PASSWORD_HASH','WORKER_API_KEY','N8N_API_KEY','N8N_BASE_URL','PAGE_CONCURRENCY'],old=Object.fromEntries(keys.map(key=>[key,process.env[key]])),oldFetch=globalThis.fetch;
  const folder=await mkdtemp(join(tmpdir(),'echolink-autofill-')),password='test-owner-password-1234';
  try{
    process.chdir(folder);process.env.WORKER_API_KEY='x'.repeat(40);process.env.N8N_API_KEY='existing-test-n8n-key';
    const source='N8N_API_KEY=existing-test-n8n-key\n';await writeFile('.env.local',source);
    process.env.N8N_BASE_URL='http://localhost:5678';
    let networkCalls=0;
    globalThis.fetch=async()=>{networkCalls++;throw new Error('Unexpected network call');};
    const origin=`http://127.0.0.1:${process.env.PORT||8787}`;
    const call=(path,body)=>app.fetch(new Request(origin+'/admin/api/'+path,{method:'POST',headers:{Origin:origin,Cookie:'echolink_admin='+issueSession(),'Content-Type':'application/json'},body:JSON.stringify(body)}));
    for(const mode of ['environment','hash']){
      if(mode==='environment'){process.env.DASHBOARD_PASSWORD=password;delete process.env.DASHBOARD_PASSWORD_HASH;}
      else{delete process.env.DASHBOARD_PASSWORD;process.env.DASHBOARD_PASSWORD_HASH=await passwordHash(password);}
      const response=await call('settings',{n8nAPIKey:password});
      assert.equal(response.status,400);assert.match((await response.json()).error,/browser autofill/);
      const direct=await call('n8n-key',{n8nAPIKey:' '+password+' '});
      assert.equal(direct.status,400);assert.match((await direct.json()).error,/browser autofill/);
      assert.equal(process.env.N8N_API_KEY,'existing-test-n8n-key');assert.equal(await readFile('.env.local','utf8'),source);
    }
    assert.equal(networkCalls,0);
    assert.equal((await call('settings',{n8nAPIKey:'a-real-key-from-a-stale-tab'})).status,400);
    for(const result of [401,403,500,'offline','html','wrong-workflow','redirect']){
      globalThis.fetch=async(url,options)=>{
        assert.equal(String(url),'http://localhost:5678/api/v1/workflows/echolinkPipeline01');
        assert.equal(options.redirect,'error');
        if(result==='offline')throw new Error('PRIVATE upstream credential error');
        if(result==='html')return new Response('<html>PRIVATE upstream response</html>');
        if(result==='wrong-workflow')return Response.json({id:'other'});
        if(result==='redirect')return new Response(null,{status:302,headers:{Location:'https://example.com'}});
        return Response.json({error:'PRIVATE upstream response'},{status:result});
      };
      const response=await call('n8n-key',{n8nAPIKey:'invalid-or-unverified'});
      assert.equal(response.status,400);assert.doesNotMatch(await response.text(),/PRIVATE/);
      assert.equal(process.env.N8N_API_KEY,'existing-test-n8n-key');assert.equal(await readFile('.env.local','utf8'),source);
    }
    globalThis.fetch=async(url,options)=>{
      assert.equal(options.headers['X-N8N-API-KEY'],'verified-new-key');
      return Response.json({id:'echolinkPipeline01'});
    };
    const accepted=await call('n8n-key',{n8nAPIKey:' verified-new-key '});
    assert.equal(accepted.status,200);assert.deepEqual(await accepted.json(),{ok:true,verified:true});
    assert.equal(process.env.N8N_API_KEY,'verified-new-key');
    const general=await call('settings',{pageConcurrency:2});assert.equal(general.status,200);
    assert.match(await readFile('.env.local','utf8'),/N8N_API_KEY='verified-new-key'/);
    assert.equal(process.env.N8N_API_KEY,'verified-new-key');
  }finally{
    globalThis.fetch=oldFetch;
    process.chdir(before);for(const [key,value] of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;
    if(dirname(resolve(folder))!==resolve(tmpdir())||!basename(folder).startsWith('echolink-autofill-'))throw new Error('Unsafe test cleanup path');
    await rm(folder,{recursive:true,force:true});
  }
});
