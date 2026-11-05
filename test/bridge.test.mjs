import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('public bridge requires its own key and excludes tickets and worker jobs',async()=>{
  const upstream=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({path:req.url,cookie:req.headers.cookie,origin:req.headers.origin}));});
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const key='test-bridge-key-'.repeat(4);
  const child=spawn(process.execPath,['src/bridge.mjs'],{env:{...process.env,BRIDGE_PORT:'0',PORT:String(upstream.address().port),WORKER_BRIDGE_TOKEN:key},stdio:['ignore','pipe','pipe']});
  try{
    const base=await new Promise((resolve,reject)=>{
      let output='';const timer=setTimeout(()=>reject(new Error('Bridge startup timed out')),10000);timer.unref();
      child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});
      child.on('error',reject);
    });
    assert.equal((await fetch(base+'/admin/api/auth')).status,401);
    const headers={'X-EchoLink-Bridge-Key':key,Cookie:'session=test',Origin:'https://dashboard.example'};
    assert.equal((await fetch(base+'/admin/api/ticket',{headers})).status,404);
    assert.equal((await fetch(base+'/jobs/process',{headers,method:'POST'})).status,404);
    assert.equal((await fetch(base+'/admin/api/auth',{headers,method:'DELETE'})).status,404);
    const response=await fetch(base+'/admin/api/auth',{headers});assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{path:'/admin/api/auth',cookie:'session=test',origin:'https://dashboard.example'});
    for(const name of ['n8n-key','test-n8n','facebook-connect','schedule-slot','test-website']){
      const response=await fetch(base+'/admin/api/'+name,{headers,method:'POST',body:'{}'});assert.equal(response.status,200);
      assert.equal((await response.json()).path,'/admin/api/'+name);
    }
    assert.equal((await fetch(base+'/admin/api/n8n-key/extra',{headers})).status,404);
  }finally{
    if(child.exitCode===null){const stopped=once(child,'exit');child.kill();await stopped;}
    await new Promise(resolve=>upstream.close(resolve));
  }
});
