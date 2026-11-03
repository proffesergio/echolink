import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { workflows, aiAdapter, pipeline, commentWorkflow } from './workflows.mjs';
async function check(dir) {
  for (const f of await readdir(dir, { withFileTypes: true })) {
    if (f.isDirectory()) await check(`${dir}/${f.name}`);
    else if (/\.(mjs|js)$/.test(f.name)) {
      const r = spawnSync(process.execPath, ['--check', `${dir}/${f.name}`], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(r.stderr);
    }
  }
}
await check('src'); await check('scripts'); await check('test');
await check('deploy/vercel/api');
const dashboard=spawnSync(process.execPath,['deploy/vercel/build.mjs'],{encoding:'utf8'});
if(dashboard.status!==0)throw new Error('Vercel dashboard asset build failed');
console.log(dashboard.stdout.trim());
await mkdir('workflows', { recursive: true });
for (const [i, workflow] of [...workflows(), aiAdapter()].entries()) {
  const name = i < 6 ? ['sync','ingest','process','mirror','approvals','analytics'][i] : 'ai-adapter';
  await writeFile(`workflows/${String(i + 1).padStart(2, '0')}-${name}.json`, JSON.stringify(workflow, null, 2) + '\n');
}
const sql = await readFile('sql/001-initial.sql', 'utf8');
await writeFile('workflows/00-complete-pipeline.json', JSON.stringify(pipeline(), null, 2) + '\n');
await writeFile('workflows/08-source-comments.json', JSON.stringify(commentWorkflow(), null, 2) + '\n');
if (!sql.includes('UNIQUE(page_id,url_hash)')) throw new Error('Missing tenant deduplication constraint');
console.log('Build passed: JavaScript syntax checked; 9 inactive n8n workflow manifests generated; migrations present.');
