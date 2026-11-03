import '../src/env.mjs';
import { readFile, readdir } from 'node:fs/promises';
import { hash } from '../src/core.mjs';
if (!process.env.DATABASE_URL_UNPOOLED) throw new Error('DATABASE_URL_UNPOOLED is required for migrations');
if (new URL(process.env.DATABASE_URL_UNPOOLED).hostname.includes('-pooler')) throw new Error('Migrations require a direct connection');
const { default: pg } = await import('pg');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED, connectionTimeoutMillis: 15000 });
try {
  await client.connect(); await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('echolink:migrate',0))");
  await client.query('CREATE SCHEMA IF NOT EXISTS echolink');
  await client.query('CREATE TABLE IF NOT EXISTS echolink.migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const file of (await readdir('sql')).filter(n => /^\d+.*\.sql$/.test(n)).sort()) {
    const name = file.replace(/\.sql$/, ''), sql = await readFile(`sql/${file}`, 'utf8'), checksum = hash(sql);
    const prior = await client.query('SELECT checksum FROM echolink.migrations WHERE name=$1', [name]);
    if (prior.rowCount && prior.rows[0].checksum !== checksum) throw new Error('Applied migration changed; create a new migration');
    if (!prior.rowCount) { await client.query(sql); await client.query('INSERT INTO echolink.migrations(name,checksum) VALUES($1,$2)', [name, checksum]); }
    console.log(`Migration ${name} applied or already current.`);
  }
  await client.query('COMMIT');
} catch (e) { await client.query('ROLLBACK').catch(() => {}); console.error('Migration failed:', e.code || 'connection/configuration error'); process.exitCode = 1; }
finally { await client.end(); }
