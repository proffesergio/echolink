let poolPromise;
let coordinationPromise;
export async function pool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
  poolPromise ||= import('pg').then(({ default: pg }) => {
    const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 15000, idleTimeoutMillis: 30000, statement_timeout: 30000 });
    p.on('error', () => console.error('Idle database connection failed'));
    return p;
  });
  return poolPromise;
}
export async function query(sql, args = []) { return (await pool()).query(sql, args); }
export async function closePools() {
  await Promise.all([poolPromise, coordinationPromise].filter(Boolean).map(async p => (await p).end()));
}
export async function resetPools(){
  const old=[poolPromise,coordinationPromise].filter(Boolean);
  poolPromise=undefined;coordinationPromise=undefined;
  await Promise.allSettled(old.map(async p=>(await p).end()));
}
export async function transaction(fn, { coordination = false } = {}) {
  // Separate lock connections prevent simultaneous scheduled jobs from exhausting
  // the query pool while each waits for a second connection to do its work.
  if (coordination && !coordinationPromise) coordinationPromise = import('pg').then(({ default: pg }) => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
    const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 15000, idleTimeoutMillis: 30000 });
    p.on('error', () => console.error('Idle coordination connection failed'));
    return p;
  });
  const client = await (coordination ? await coordinationPromise : await pool()).connect();
  try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}
