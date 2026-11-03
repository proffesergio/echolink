import './env.mjs';
import { authorized } from './core.mjs';
import { query } from './db.mjs';
import { jobs } from './jobs.mjs';
import { admin } from './admin.mjs';
import {planTick,runScheduled} from './scheduler.mjs';
import {runJob} from './telemetry.mjs';
export default {
  async fetch(req) {
    const url = new URL(req.url);
    const dashboard = await admin(req);
    if (dashboard) return dashboard;
    if (req.method === 'GET' && url.pathname === '/health') return Response.json({ ok: true, service: 'echolink', dryRun: process.env.DRY_RUN !== 'false' });
    if (!authorized(req.headers.get('authorization'), process.env.WORKER_API_KEY)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      if (req.method === 'GET' && url.pathname === '/ready') {
        await query('SELECT 1 FROM echolink.configurations LIMIT 1');
        return Response.json({ ok: true, database: 'ready' });
      }
      const name = url.pathname.match(/^\/jobs\/([a-z]+)$/)?.[1];
      if(req.method==='POST'&&name==='plan')return Response.json(await planTick(url.searchParams.get('force')==='1'));
      if (req.method !== 'POST' || !name || !Object.hasOwn(jobs, name)) return Response.json({ error: 'Not found' }, { status: 404 });
      const scheduled=url.searchParams.get('scheduled')==='1';
      const invoke=()=>runJob(name,jobs[name],scheduled?'n8n schedule':'n8n manual');
      const result=scheduled?await runScheduled(name,invoke):await invoke();
      return Response.json({ ok: true, job: name, result });
    } catch (e) {
      // Never expose driver errors, request URLs, credentials or article content.
      console.error(JSON.stringify({ event: 'job_failed', code: /^[A-Z0-9_]{2,20}$/.test(e.code || '') ? e.code : 'UPSTREAM_OR_CONFIG' }));
      return Response.json({ error: 'Job failed. Verify service configuration and connectivity.' }, { status: 503 });
    }
  },
};
