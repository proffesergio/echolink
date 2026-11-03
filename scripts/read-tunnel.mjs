import '../src/env.mjs';
import {readFile} from 'node:fs/promises';
import {saveSettings} from '../src/settings.mjs';
const log=await readFile('.codex/logs/tunnel.stderr.log','utf8');
const origin=log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0];
if(!origin)throw new Error('Tunnel has not reported an HTTPS address. Check tunnel.stderr.log.');
await saveSettings({WORKER_ORIGIN:origin});
console.log('Saved the new tunnel address locally. Run node scripts/configure-vercel.mjs and redeploy the dashboard.');
