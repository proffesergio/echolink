import '../src/env.mjs';
import { randomUUID } from 'node:crypto';
import { hash, titleHash } from '../src/core.mjs';
import { pool } from '../src/db.mjs';
const p = await pool(), c = await p.connect();
try {
  await c.query('BEGIN');
  const page = `probe-${randomUUID()}`, urlHash = hash('https://example.com/probe'), th = titleHash('Probe news headline');
  const insert = (id, pageId, url, title) => c.query(`INSERT INTO echolink.articles(id,page_id,url_hash,title_hash,title,source_url,body)
    VALUES($1,$2,$3,$4,'Probe news headline','https://example.com/probe','Database integration probe only') ON CONFLICT DO NOTHING`, [id, pageId, url, title]);
  const articleId=randomUUID();
  if ((await insert(articleId, page, urlHash, th)).rowCount !== 1) throw new Error('Initial insert failed');
  if ((await insert(randomUUID(), page, urlHash, titleHash('Other headline'))).rowCount !== 0) throw new Error('URL duplicate not blocked');
  if ((await insert(randomUUID(), page, hash('another-url'), th)).rowCount !== 0) throw new Error('Title duplicate not blocked');
  if ((await insert(randomUUID(), `${page}-other`, urlHash, th)).rowCount !== 1) throw new Error('Cross-page isolation failed');
  console.log('PASS PostgreSQL: insert, URL deduplication, title deduplication, tenant isolation.');
  const commentArgs=[articleId,page,'probe-no-real-post','https://example.com/probe'];
  const enqueue=()=>c.query("INSERT INTO echolink.source_comments(article_id,page_id,fb_post_id,message,due_at) VALUES($1,$2,$3,$4,now()+interval '5 minutes') ON CONFLICT DO NOTHING",commentArgs);
  if((await enqueue()).rowCount!==1||(await enqueue()).rowCount!==0)throw new Error('Source comment outbox did not prevent duplicate enqueue');
  const due=await c.query('SELECT due_at>now() AS delayed,status FROM echolink.source_comments WHERE article_id=$1',[articleId]);
  if(!due.rows[0].delayed||due.rows[0].status!=='Queued')throw new Error('Comment due-time persistence failed');
  console.log('PASS durable source comments: future due time, queued state and one outbox entry per article.');
  await c.query('ROLLBACK');
  const residue = await c.query('SELECT count(*)::int AS count FROM echolink.articles WHERE page_id IN ($1,$2)', [page, `${page}-other`]);
  if (residue.rows[0].count !== 0) throw new Error('Probe cleanup failed');
  console.log('PASS rollback: no test articles persisted.');
} catch (e) { await c.query('ROLLBACK'); console.error('Database probe failed:', e.code || e.message); process.exitCode = 1; }
finally { c.release(); await p.end(); }
