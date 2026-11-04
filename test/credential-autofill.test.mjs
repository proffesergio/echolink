import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import app from '../src/app.mjs';
import {issueSession,passwordHash} from '../src/admin-auth.mjs';

test('autofilled owner passwords cannot replace n8n credentials in memory or on disk',async()=>{
  const before=process.cwd(),keys=['DASHBOARD_PASSWORD','DASHBOARD_PASSWORD_HASH','WORKER_API_KEY','N8N_API_KEY'],old=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const folder=await mkdtemp(join(tmpdir(),'echolink-autofill-')),password='test-owner-password-1234';
  try{
    process.chdir(folder);process.env.WORKER_API_KEY='x'.repeat(40);process.env.N8N_API_KEY='existing-test-n8n-key';
    const source='N8N_API_KEY=existing-test-n8n-key\n';await writeFile('.env.local',source);
    for(const mode of ['environment','hash']){
      if(mode==='environment'){process.env.DASHBOARD_PASSWORD=password;delete process.env.DASHBOARD_PASSWORD_HASH;}
      else{delete process.env.DASHBOARD_PASSWORD;process.env.DASHBOARD_PASSWORD_HASH=await passwordHash(password);}
      const origin=`http://127.0.0.1:${process.env.PORT||8787}`;
      const response=await app.fetch(new Request(origin+'/admin/api/settings',{method:'POST',headers:{Origin:origin,Cookie:'echolink_admin='+issueSession(),'Content-Type':'application/json'},body:JSON.stringify({n8nAPIKey:password})}));
      assert.equal(response.status,400);assert.match((await response.json()).error,/browser autofill/);
      assert.equal(process.env.N8N_API_KEY,'existing-test-n8n-key');assert.equal(await readFile('.env.local','utf8'),source);
    }
  }finally{
    process.chdir(before);for(const [key,value] of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;
    if(dirname(resolve(folder))!==resolve(tmpdir())||!basename(folder).startsWith('echolink-autofill-'))throw new Error('Unsafe test cleanup path');
    await rm(folder,{recursive:true,force:true});
  }
});
