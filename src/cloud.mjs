// Cloud control-plane companion. Local feeds, models and publishing stay on the
// local worker; a Neon Function cannot reach the user's localhost.
import { authorized } from './core.mjs';
import { query } from './db.mjs';
import { storeSnapshot } from './storage.mjs';
export default {
  async fetch(request) {
    if (!authorized(request.headers.get('authorization'), process.env.WORKER_API_KEY)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/ready') {
        await query('SELECT 1 FROM echolink.configurations LIMIT 1');
        return Response.json({ ok: true, database: 'ready' });
      }
      if (request.method === 'POST' && url.pathname === '/snapshot') {
        const { rows } = await query('SELECT page_id,status,count(*)::int AS count FROM echolink.articles GROUP BY page_id,status');
        const key = await storeSnapshot({ generatedAt: new Date().toISOString(), counts: rows });
        return Response.json({ ok: true, key });
      }
      return Response.json({ error: 'Not found' }, { status: 404 });
    } catch { return Response.json({ error: 'Service unavailable' }, { status: 503 }); }
  },
};
