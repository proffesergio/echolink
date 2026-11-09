import '../platform/server/env.mjs';
import {spawn} from 'node:child_process';
import {readFile,writeFile,access} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from '../platform/node_modules/pg/lib/index.js';
import {postgresExecutable} from './postgres-tools.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=resolve(root,'.codex/backups'),file=resolve(process.argv[2]||''),rel=relative(dir,file);
if(!process.argv[2]||rel.startsWith('..')||isAbsolute(rel)||!file.endsWith('.dump'))throw new Error('Provide a complete .dump file inside .codex/backups. A new database will be created; existing databases are never overwritten.');
await access(file);let manifest;try{manifest=JSON.parse(await readFile(file+'.json','utf8'));}catch{}if(manifest?.testOnly&&!process.argv.includes('--allow-test'))throw new Error('This is an isolated test backup, not the production workspace.');if(manifest?.standbyOnly&&!process.argv.includes('--allow-standby'))throw new Error('This backup contains initialized standby data, not the existing production workspace. Use --allow-standby only for a rehearsal.');const settings=parseEnv(await readFile(resolve(root,'platform/.env.postgres.local'),'utf8')),adminURL=new URL(settings.LOCAL_POSTGRES_ADMIN_URL);
if(adminURL.hostname!=='127.0.0.1'||adminURL.port!=='55432')throw new Error('Only the prepared loopback PostgreSQL cluster is allowed.');
const target='echolink_recovery_'+Date.now(),admin=new pg.Client({connectionString:adminURL.href});
await admin.connect();try{
 // Aiven registry policies name these two minimal roles. Restore the policy
 // identities without login credentials; runtime grants are reapplied below.
 if(manifest?.sourceProfile==='aiven')for(const role of ['echolink_route_reader','echolink_route_writer'])if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount)await admin.query('CREATE ROLE '+role+' NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');
 await admin.query('CREATE DATABASE '+target+' OWNER echolink_owner');}finally{await admin.end();}
const targetURL=new URL(adminURL);targetURL.pathname='/'+target;
const environment={...process.env,PGHOST:'127.0.0.1',PGPORT:'55432',PGDATABASE:target,PGUSER:decodeURIComponent(adminURL.username),PGPASSWORD:decodeURIComponent(adminURL.password),PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'10'};
try{
 await new Promise((resolveRun,reject)=>{const child=spawn(postgresExecutable('pg_restore'),['--exit-on-error','--no-owner','--no-acl','--dbname',target,file],{env:environment,windowsHide:true,stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',b=>stderr+=b);child.on('error',reject);child.on('exit',code=>code===0?resolveRun():reject(new Error('Restore failed before activation; inspect the new recovery database. Existing databases were not changed.')));});
 const db=new pg.Client({connectionString:targetURL.href});await db.connect();let counts;try{
  await db.query('GRANT USAGE ON SCHEMA creator,public TO creator_runtime');await db.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA creator TO creator_runtime');await db.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA creator TO creator_runtime');await db.query('GRANT SELECT,INSERT,UPDATE,DELETE ON public.auth_user,public.auth_account,public.auth_session,public.auth_verification TO creator_runtime');
  counts={};for(const table of ['migrations','accounts','workspaces','pages','posts','connections','tasks','publish_attempts'])counts[table]=(await db.query('SELECT count(*)::int AS n FROM creator.'+table)).rows[0].n;
  const invalid=(await db.query("SELECT count(*)::int AS n FROM pg_constraint WHERE connamespace='creator'::regnamespace AND NOT convalidated")).rows[0].n;if(invalid)throw new Error('Unvalidated constraints need inspection.');
 }finally{await db.end();}
 const runtimeURL=new URL(settings.LOCAL_POSTGRES_DATABASE_URL);runtimeURL.pathname='/'+target;
 const runtime=new pg.Client({connectionString:runtimeURL.href});await runtime.connect();try{const role=(await runtime.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0],rows=(await runtime.query('SELECT count(*)::int AS n FROM creator.posts')).rows[0].n;if(role.rolsuper||role.rolbypassrls||rows)throw new Error('Runtime tenant isolation check failed.');}finally{await runtime.end();}
 const config=resolve(root,'.codex',target+'.env');await writeFile(config,`DATABASE_URL=${runtimeURL.href}\nDATABASE_URL_UNPOOLED=${targetURL.href}\nPLATFORM_DATABASE_TRANSPORT=tcp\nPLATFORM_PUBLISHING_ENABLED=false\nPLATFORM_WORKER_ENABLED=false\n`,{mode:0o600});
 const report={database:target,counts,tenantIsolationPassed:true,foreignKeysValidated:true,publishingEnabled:false,activeDatabaseChanged:false,requiresDeliveryReconciliation:true,configurationFile:relative(root,config)};
 await writeFile(config+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){console.error(error.code||error.message);process.exitCode=1;}
