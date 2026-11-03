import { test } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.mjs';
test('health works with no external services; job endpoints require authentication', async () => {
  const r = await app.fetch(new Request('http://localhost/health'));
  assert.equal(r.status, 200); assert.equal((await r.json()).ok, true);
  const denied = await app.fetch(new Request('http://localhost/jobs/process', { method: 'POST' }));
  assert.equal(denied.status, 401);
});
