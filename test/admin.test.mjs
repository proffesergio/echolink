import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv } from 'node:util';
import { envValue } from '../src/settings.mjs';
import app from '../src/app.mjs';
test('secret-map settings survive dotenv parsing after restart', () => {
  const value = JSON.stringify({ 'page-one': 'token#with=characters' });
  assert.equal(parseEnv(`FB_TOKENS_JSON=${envValue(value)}`).FB_TOKENS_JSON, value);
  assert.deepEqual(JSON.parse(parseEnv(`AI_TOKENS_JSON=${envValue(value)}`).AI_TOKENS_JSON), {'page-one':'token#with=characters'});
  assert.throws(()=>envValue('one\ntwo'));
});
test('dashboard login links are authenticated, origin-bound and single-use', async () => {
  const oldKey=process.env.WORKER_API_KEY;
  process.env.WORKER_API_KEY='x'.repeat(40);
  const origin=`http://127.0.0.1:${process.env.PORT||8787}`;
  const call=(path,body,headers={})=>app.fetch(new Request('http://localhost/admin/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})}));
  try {
    assert.equal((await call('state')).status,401);
    assert.equal((await call('ticket',{})).status,401);
    const issued=await call('ticket',{}, {Authorization:'Bearer '+process.env.WORKER_API_KEY});
    const {ticket}=await issued.json();assert.match(ticket,/^[a-f0-9]{64}$/);
    assert.equal((await call('session',{ticket},{Origin:'https://example.com'})).status,403);
    const accepted=await call('session',{ticket},{Origin:origin});
    assert.equal(accepted.status,200);assert.ok(accepted.headers.get('set-cookie').includes('HttpOnly'));
    assert.equal((await call('session',{ticket},{Origin:origin})).status,401);
    assert.equal((await call('hosts',{hosts:'example.com'},{Origin:'https://example.com',Cookie:accepted.headers.get('set-cookie')})).status,403);
  } finally {if(oldKey===undefined)delete process.env.WORKER_API_KEY;else process.env.WORKER_API_KEY=oldKey;}
});
