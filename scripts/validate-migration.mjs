import '../src/env.mjs';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { parseEnv } from 'node:util';
const branch = `dev-bootstrap-${Date.now()}`;
const file = `.codex/secrets/${branch}.env`;
function cli(args) {
  const r = spawnSync('neon', args, { shell: process.platform === 'win32', encoding: 'utf8', timeout: 180000 });
  if (r.status !== 0) throw new Error(`Neon command failed: ${args[0]} ${args[1] || ''} (exit ${r.status})`);
  return r.stdout;
}
let created = false;
try {
  await mkdir('.codex/secrets', { recursive: true });
  cli(['branches', 'create', '--name', branch, '--parent', 'production', '--expires-at', new Date(Date.now() + 86400000).toISOString(), '--no-secrets', '--output', 'json']);
  created = true;
  cli(['env', 'pull', '--branch', branch, '--service', 'postgres', '--file', file]);
  const env = { ...process.env, ...parseEnv(await readFile(file, 'utf8')) };
  const result = spawnSync(process.execPath, ['scripts/migrate.mjs'], { env, encoding: 'utf8', timeout: 60000 });
  console.log(result.stdout.trim());
  if (result.status !== 0) throw new Error('Migration failed on temporary branch');
  const { default: pg } = await import('pg');
  const c = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 15000 });
  try {
    await c.connect();
    const tables = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='echolink'");
    const expected = ['configurations','articles','publish_attempts','analytics','service_probes','migrations','source_comments','ingestion_events','job_schedule','job_runs','sheet_sync'];
    if (expected.some(name => !tables.rows.some(row => row.table_name === name))) throw new Error('Migration tables missing');
    console.log(`PASS migration branch: all ${expected.length} required tables available`);
    const scheduler=spawnSync(process.execPath,['scripts/check-scheduler.mjs'],{env:{...env,ECHOLINK_TEST_BRANCH:branch},encoding:'utf8',timeout:60000});
    console.log(scheduler.stdout.trim());if(scheduler.status!==0)throw new Error('Scheduler validation failed');
    const newsroom=spawnSync(process.execPath,['scripts/check-newsroom.mjs'],{env:{...env,ECHOLINK_TEST_BRANCH:branch},encoding:'utf8',timeout:60000});
    console.log(newsroom.stdout.trim());if(newsroom.status!==0)throw new Error('Newsroom validation failed');
  } finally { await c.end(); }
} catch (e) { console.error(e.message); process.exitCode = 1; }
finally {
  await rm(file, { force: true });
  if (created) {
    try { cli(['branches', 'delete', branch]); console.log('Temporary migration branch removed; production environment unchanged.'); }
    catch { console.error(`Temporary branch cleanup failed: ${branch} (expires in 24 hours)`); process.exitCode = 1; }
  }
}
