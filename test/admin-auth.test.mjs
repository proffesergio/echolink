import {test} from 'node:test';
import assert from 'node:assert/strict';
import {passwordHash,verifyPassword,authenticatePassword,passwordConfigured,passwordSource,issueSession,validSession} from '../src/admin-auth.mjs';
import app from '../src/app.mjs';
test('password login, signed session expiry and password change revocation',async()=>{
  const oldKey=process.env.WORKER_API_KEY,oldHash=process.env.DASHBOARD_PASSWORD_HASH,oldPassword=process.env.DASHBOARD_PASSWORD;
  process.env.WORKER_API_KEY='k'.repeat(40);
  delete process.env.DASHBOARD_PASSWORD;
  try{
    const encoded=await passwordHash('a good local password');process.env.DASHBOARD_PASSWORD_HASH=encoded;
    assert.equal(await verifyPassword('a good local password',encoded),true);
    assert.equal(await verifyPassword('wrong password',encoded),false);
    await assert.rejects(passwordHash('short'));
    const session=issueSession();assert.equal(validSession(session),true);
    const {validSession:reloaded}=await import('../src/admin-auth.mjs?restart=1');
    assert.equal(reloaded(session),true);
    assert.equal(validSession(session,Date.now()+8*3600000),false);
    assert.equal(validSession(session+'x'),false);
    const login=password=>app.fetch(new Request('http://localhost/admin/api/login',{method:'POST',headers:{Origin:`http://127.0.0.1:${process.env.PORT||8787}`,'Content-Type':'application/json'},body:JSON.stringify({password})}));
    assert.equal((await login('wrong password')).status,401);
    const accepted=await login('a good local password');assert.equal(accepted.status,200);
    const auth=await app.fetch(new Request('http://localhost/admin/api/auth',{headers:{Cookie:accepted.headers.get('set-cookie')}}));
    assert.equal((await auth.json()).authenticated,true);
    process.env.DASHBOARD_PASSWORD_HASH=await passwordHash('another local password');
    assert.equal(validSession(session),false);
    process.env.DASHBOARD_PASSWORD='environment login password';
    assert.equal(passwordConfigured(),true);assert.equal(passwordSource(),'environment');
    assert.equal(await authenticatePassword('environment login password'),true);
    assert.equal(await authenticatePassword('another local password'),false);
    const environmentSession=issueSession();process.env.DASHBOARD_PASSWORD='changed environment password';
    assert.equal(validSession(environmentSession),false);
    assert.equal((await login('changed environment password')).status,200);
  }finally{
    if(oldKey===undefined)delete process.env.WORKER_API_KEY;else process.env.WORKER_API_KEY=oldKey;
    if(oldHash===undefined)delete process.env.DASHBOARD_PASSWORD_HASH;else process.env.DASHBOARD_PASSWORD_HASH=oldHash;
    if(oldPassword===undefined)delete process.env.DASHBOARD_PASSWORD;else process.env.DASHBOARD_PASSWORD=oldPassword;
  }
});
