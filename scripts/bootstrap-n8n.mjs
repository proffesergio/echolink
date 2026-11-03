import '../src/env.mjs';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { saveMissing } from './local-config.mjs';
import { workflows, aiAdapter } from './workflows.mjs';

const dbPath = process.env.N8N_SQLITE_PATH || join(process.env.USERPROFILE, '.n8n', 'database.sqlite');
const db = new DatabaseSync(dbPath, { readOnly: true });
const project = db.prepare("SELECT id FROM project WHERE type='personal'").all();
if (project.length !== 1) throw new Error('Set up exactly one target personal project before using this bootstrap');
const credentialId = 'echolinkWorkerAuth01';
const credentialExists = db.prepare('SELECT id FROM credentials_entity WHERE id=?').get(credentialId);
const prefix = 'echolinkLocal';
const existing = db.prepare("SELECT id,name FROM workflow_entity WHERE name LIKE 'EchoLink%' AND id NOT LIKE ? AND id NOT IN ('echolinkPipeline01','echolinkComments1')").all(`${prefix}%`);
if (existing.length) throw new Error('Existing EchoLink workflows need review before bootstrap import');
db.close();
await saveMissing({ WORKER_API_KEY: randomBytes(32).toString('hex'), DRY_RUN: 'true' });
if (process.env.DRY_RUN !== 'true') throw new Error('Bootstrap requires DRY_RUN=true');
if (!process.env.WORKER_API_KEY || process.env.WORKER_API_KEY.length < 32) throw new Error('Worker key must be at least 32 characters');
await mkdir('.codex/secrets', { recursive: true });
const credentialFile = '.codex/secrets/n8n-worker-credential.json';
const workflowFile = '.codex/secrets/n8n-workflows.json';
function cli(args) {
  const result = spawnSync('n8n', args, { shell: process.platform === 'win32', encoding: 'utf8', timeout: 180000, env: { ...process.env, N8N_DIAGNOSTICS_ENABLED: 'false' } });
  if (result.status !== 0) throw new Error(`n8n ${args[0]} failed (exit ${result.status}); inspect local n8n logs`);
  console.log(result.stdout.trim());
}
try {
  if (!credentialExists) {
    await writeFile(credentialFile, JSON.stringify([{ id: credentialId, name: 'EchoLink local worker', type: 'httpHeaderAuth', data: { name: 'Authorization', value: `Bearer ${process.env.WORKER_API_KEY}` } }]), { mode: 0o600 });
    cli(['import:credentials', `--input=${credentialFile}`, `--projectId=${project[0].id}`]);
  }
  const manifests = [...workflows(), aiAdapter()].map((w, i) => {
    w.id = `${prefix}${String(i + 1).padStart(3, '0')}`;
    for (const node of w.nodes) if (node.name === 'Run job') node.credentials = { httpHeaderAuth: { id: credentialId, name: 'EchoLink local worker' } };
    return w;
  });
  await writeFile(workflowFile, JSON.stringify(manifests));
  cli(['import:workflow', `--input=${workflowFile}`, `--projectId=${project[0].id}`]);
  console.log('Imported seven inactive workflows with the worker credential attached.');
} finally { await rm(credentialFile, { force: true }); await rm(workflowFile, { force: true }); }
