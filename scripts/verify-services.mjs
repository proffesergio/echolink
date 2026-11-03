import '../src/env.mjs';
import { randomUUID } from 'node:crypto';
let failed = 0;
async function check(name, required, fn) {
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) { console.log(`UNVERIFIED ${name}: missing ${missing.join(', ')}`); failed++; return; }
  try { await fn(); console.log(`PASS ${name}`); } catch (e) { console.log(`FAIL ${name}: ${e.code || 'request/response verification failed'}`); failed++; }
}
await check('PostgreSQL write/read/rollback', ['DATABASE_URL'], async () => {
  const { pool } = await import('../src/db.mjs'); const p = await pool(); const c = await p.connect();
  try {
    await c.query('BEGIN'); const id = randomUUID();
    await c.query('INSERT INTO echolink.service_probes(id,value) VALUES($1,$2)', [id, 'echolink-e2e']);
    const r = await c.query('SELECT value FROM echolink.service_probes WHERE id=$1', [id]);
    if (r.rows[0]?.value !== 'echolink-e2e') throw new Error('Probe mismatch');
    await c.query('ROLLBACK');
  } finally { c.release(); await p.end(); }
});
await check('AI Gateway inference', ['NEON_AI_GATEWAY_BASE_URL','NEON_AI_GATEWAY_TOKEN','VERIFY_AI_MODEL'], async () => {
  const headers = { Authorization: `Bearer ${process.env.NEON_AI_GATEWAY_TOKEN}`, 'Content-Type': 'application/json' };
  const base = process.env.NEON_AI_GATEWAY_BASE_URL;
  const catalog = await fetch(`${base}/v1/models`, { headers, signal: AbortSignal.timeout(30000) });
  if (!catalog.ok) throw new Error('Catalog failed');
  const model = (await catalog.json()).data?.find(m => m.id === process.env.VERIFY_AI_MODEL);
  if (!model || model.enabled === false) throw new Error('Model unavailable');
  const r = await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers, body: JSON.stringify({ model: model.id, max_tokens: 20, messages: [{ role: 'user', content: 'Reply with the word connected.' }] }), signal: AbortSignal.timeout(90000) });
  if (!r.ok || !(await r.json()).choices?.[0]?.message?.content) throw new Error('Inference failed');
});
await check('Object Storage put/get/delete', ['AWS_ENDPOINT_URL_S3','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_REGION','STORAGE_BUCKET'], async () => {
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({ forcePathStyle: true });
  const object = { Bucket: process.env.STORAGE_BUCKET, Key: `probes/${randomUUID()}.txt` };
  try {
    await client.send(new PutObjectCommand({ ...object, Body: 'echolink-e2e', ContentType: 'text/plain' }));
    const r = await client.send(new GetObjectCommand(object));
    if (await r.Body.transformToString() !== 'echolink-e2e') throw new Error('Object mismatch');
  } finally { await client.send(new DeleteObjectCommand(object)); client.destroy(); }
});
await check('Neon Function authenticated readiness', ['NEON_FUNCTION_ECHOLINKAPI_BASE_URL','WORKER_API_KEY'], async () => {
  const r = await fetch(`${process.env.NEON_FUNCTION_ECHOLINKAPI_BASE_URL}/ready`, { headers: { Authorization: `Bearer ${process.env.WORKER_API_KEY}` }, signal: AbortSignal.timeout(45000) });
  if (!r.ok || !(await r.json()).ok) throw new Error('Function readiness failed');
  const snapshot = await fetch(`${process.env.NEON_FUNCTION_ECHOLINKAPI_BASE_URL}/snapshot`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.WORKER_API_KEY}` }, signal: AbortSignal.timeout(45000) });
  if (!snapshot.ok || !(await snapshot.json()).key) throw new Error('Function snapshot failed');
});
process.exitCode = failed ? 1 : 0;
