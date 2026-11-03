import { spawnSync } from 'node:child_process';
for (const [index, name] of ['sync','ingest','process','mirror','approvals','analytics'].entries()) {
  const id = `echolinkLocal${String(index + 1).padStart(3, '0')}`;
  const result = spawnSync('n8n', ['execute', `--id=${id}`, '--rawOutput'], { shell: process.platform === 'win32', encoding: 'utf8', timeout: 120000, env: { ...process.env, N8N_DIAGNOSTICS_ENABLED: 'false', N8N_RUNNERS_BROKER_PORT: '5689' } });
  if (result.status !== 0) { console.error(`FAIL n8n ${name}: CLI exit ${result.status}`); process.exit(1); }
  const start = result.stdout.search(/\{\s*"data"\s*:/);
  if (start < 0) throw new Error(`No execution result for ${name}`);
  const execution = JSON.parse(result.stdout.slice(start));
  const response = execution.data.resultData.runData['Run job']?.[0]?.data?.main?.[0]?.[0]?.json;
  if (execution.status !== 'success' || !response?.ok) throw new Error(`Workflow ${name} did not succeed`);
  console.log(`PASS n8n ${name}: ${JSON.stringify(response.result)}`);
}
console.log('All six imported job workflows executed through authenticated HTTP into the local worker.');
