import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
test('local worker starts and serves health; unauthenticated jobs are denied over HTTP', async () => {
  const child = spawn(process.execPath, ['src/server.mjs'], { env: { ...process.env, PORT: '0', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  try {
    const line = await Promise.race([
      new Promise((resolve, reject) => { child.stdout.on('data', data => { output += data; if (output.includes('EchoLink listening')) resolve(output); }); child.once('error', reject); child.once('exit', code => reject(new Error(`Worker exited ${code}`))); }),
      new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Startup timeout')), 10000); timer.unref(); }),
    ]);
    const base = line.match(/http:\/\/127\.0\.0\.1:\d+/)[0];
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200); assert.equal((await response.json()).service, 'echolink');
    const denied = await fetch(`${base}/jobs/process`, { method: 'POST' });
    assert.equal(denied.status, 401);
  } finally { if (child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped; } }
});
