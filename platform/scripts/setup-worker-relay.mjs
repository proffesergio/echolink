import '../server/env.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
const root=new URL('../../.env.local',import.meta.url),text=await readFile(root,'utf8'),saved=parseEnv(text),owner=new pg.Client({connectionString:process.env.DATABASE_URL_UNPOOLED});
try{await owner.connect();const prior=saved.WORKER_REGISTRY_URL&&new URL(saved.WORKER_REGISTRY_URL),password=prior?.username==='creator_relay'?decodeURIComponent(prior.password):randomBytes(32).toString('base64url');
 const exists=(await owner.query("SELECT 1 FROM pg_roles WHERE rolname='creator_relay'")).rowCount;
 // Generated base64url contains no SQL metacharacters; never echo the statement.
 await owner.query((exists?'ALTER':'CREATE')+" ROLE creator_relay LOGIN NOBYPASSRLS PASSWORD '"+password+"'");
 await owner.query('GRANT USAGE ON SCHEMA creator TO creator_relay');await owner.query('GRANT SELECT ON creator.worker_routes TO creator_relay');
 await owner.query('DROP POLICY IF EXISTS relay_read ON creator.worker_routes');await owner.query("CREATE POLICY relay_read ON creator.worker_routes FOR SELECT TO creator_relay USING(id='primary')");
 const uri=new URL(process.env.DATABASE_URL);uri.username='creator_relay';uri.password=password;
 await writeFile(root,text.replace(/^WORKER_REGISTRY_URL=.*\r?\n?/gm,'').trimEnd()+'\nWORKER_REGISTRY_URL='+uri.href+'\n');
 const relay=new pg.Client({connectionString:uri.href});try{await relay.connect();await relay.query('SELECT origin FROM creator.worker_routes');let denied=false;try{await relay.query('SELECT * FROM creator.connections LIMIT 1');}catch(e){denied=e.code==='42501';}if(!denied)throw new Error('Relay role must not access tenant credentials.');}finally{await relay.end();}
 console.log('Worker relay configured. Read-only routing works; tenant credentials are denied.');
}catch(e){console.error('Worker relay setup failed:',e.code||e.name);process.exitCode=1;}finally{await owner.end();}
