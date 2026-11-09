import '../platform/server/env.mjs';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir,unlink,access,readdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from '../platform/node_modules/pg/lib/index.js';
import {postgresBin} from './postgres-tools.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),bin=postgresBin(),data=resolve(root,'platform/.local/postgres/data'),settingsPath=resolve(root,'platform/.env.postgres.local'),mode=process.argv[2]||'setup';
const executable=name=>resolve(bin,name+(process.platform==='win32'?'.exe':''));
async function run(file,args,environment=process.env,{quiet=false,cwd=root}={}){return new Promise((resolveRun,reject)=>{const child=spawn(file,args,{cwd,env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{output+=b;if(!quiet)process.stdout.write(b);});child.on('error',reject);child.on('exit',code=>{child.stdout.destroy();child.stderr.destroy();code===0?resolveRun(output):reject(new Error('Local PostgreSQL command failed (exit '+code+').'));});});}
async function exists(path){try{await access(path);return true;}catch{return false;}}
const uri=(user,password,database)=>`postgresql://${user}:${password}@127.0.0.1:55432/${database}`;
let settings;
try{
 if(!await exists(executable('pg_ctl')))throw new Error('Install the official PostgreSQL binaries under .codex/tools/postgres18 first.');
 await mkdir(resolve(root,'platform/.local/postgres'),{recursive:true});
 if(await exists(settingsPath))settings=parseEnv(await readFile(settingsPath,'utf8'));else{
  if(await exists(resolve(data,'PG_VERSION')))throw new Error('Existing cluster found without its credentials. It was not overwritten.');
  const admin=randomBytes(32).toString('hex'),runtime=randomBytes(32).toString('hex');
  settings={LOCAL_POSTGRES_ADMIN_URL:uri('echolink_owner',admin,'postgres'),LOCAL_POSTGRES_DATABASE_URL:uri('creator_runtime',runtime,'echolink_local'),LOCAL_POSTGRES_DATABASE_URL_UNPOOLED:uri('echolink_owner',admin,'echolink_local'),LOCAL_POSTGRES_TEST_URL:uri('creator_runtime',runtime,'creator_test'),LOCAL_POSTGRES_TEST_URL_UNPOOLED:uri('echolink_owner',admin,'creator_test')};
  await writeFile(settingsPath,Object.entries(settings).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600});
 }
 if(!await exists(resolve(data,'PG_VERSION'))){
  const passwordFile=resolve(root,'platform/.local/postgres/init-password.tmp');await writeFile(passwordFile,decodeURIComponent(new URL(settings.LOCAL_POSTGRES_ADMIN_URL).password),{mode:0o600});
  try{await run(executable('initdb'),['-D',data,'-U','echolink_owner','--encoding=UTF8','--locale=C','--auth-host=scram-sha-256','--auth-local=scram-sha-256','--pwfile',passwordFile,'--no-instructions'],process.env,{quiet:true});}finally{await unlink(passwordFile).catch(()=>{});}
  await writeFile(resolve(data,'postgresql.auto.conf'),"listen_addresses = '127.0.0.1'\nport = 55432\nmax_connections = 40\nshared_buffers = '64MB'\nwork_mem = '2MB'\nmaintenance_work_mem = '32MB'\nmax_wal_size = '512MB'\nmin_wal_size = '64MB'\nmax_parallel_workers = 0\njit = off\n");
 }
 try{await run(executable('pg_ctl'),['-D',data,'status'],process.env,{quiet:true});}catch{await run(executable('pg_ctl'),['-D',data,'-l',resolve(root,'platform/.local/postgres/server.log'),'-w','start']);}
 if(mode==='start'){console.log('Loopback-only PostgreSQL is running on port 55432. Active app database configuration was not changed.');process.exit(0);}
 if(['test','browser'].includes(mode)){
  const base=parseEnv(await readFile(resolve(root,'platform/.env.local'),'utf8'));
  const args=mode==='browser'?['scripts/browser-verify.mjs']:['--test',...(await readdir(resolve(root,'platform/test'))).filter(f=>f.endsWith('.test.mjs')).map(f=>'test/'+f)];
  await run(process.execPath,args,{...base,...process.env,DATABASE_URL:settings.LOCAL_POSTGRES_TEST_URL,DATABASE_URL_UNPOOLED:settings.LOCAL_POSTGRES_TEST_URL_UNPOOLED,PLATFORM_DATABASE_TRANSPORT:'tcp',PLATFORM_BRANCH:'echolink-platform-local',SMTP_HOST:''},{quiet:false,cwd:resolve(root,'platform')});
  process.exit(0);
 }
 if(mode!=='setup')throw new Error('Use setup, start, test, or browser.');
 const admin=new pg.Client({connectionString:settings.LOCAL_POSTGRES_ADMIN_URL});await admin.connect();try{
  if(!(await admin.query("SELECT 1 FROM pg_roles WHERE rolname='creator_runtime'")).rowCount)await admin.query('CREATE ROLE creator_runtime LOGIN PASSWORD '+"'"+new URL(settings.LOCAL_POSTGRES_DATABASE_URL).password+"'"+' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');
  for(const name of ['echolink_local','creator_test'])if(!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount)await admin.query('CREATE DATABASE '+name+' OWNER echolink_owner');
 }finally{await admin.end();}
 const base=parseEnv(await readFile(resolve(root,'platform/.env.local'),'utf8'));
 for(const test of [false,true]){
  const direct=test?settings.LOCAL_POSTGRES_TEST_URL_UNPOOLED:settings.LOCAL_POSTGRES_DATABASE_URL_UNPOOLED,environment={...base,...process.env,DATABASE_URL:direct,DATABASE_URL_UNPOOLED:direct,PLATFORM_DATABASE_TRANSPORT:'tcp',PLATFORM_BRANCH:'echolink-platform-local',PLATFORM_PUBLISHING_ENABLED:'false',SMTP_HOST:''};
  await run(process.execPath,['platform/scripts/migrate.mjs'],environment);
  await run(process.execPath,['platform/scripts/setup-auth.mjs'],environment);
  const db=new pg.Client({connectionString:direct});await db.connect();try{
   await db.query('GRANT USAGE ON SCHEMA creator,public TO creator_runtime');await db.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA creator TO creator_runtime');await db.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA creator TO creator_runtime');await db.query('GRANT SELECT,INSERT,UPDATE,DELETE ON public.auth_user,public.auth_account,public.auth_session,public.auth_verification TO creator_runtime');
   const result=(await db.query("SELECT count(*)::int AS migrations FROM creator.migrations")).rows[0];console.log(JSON.stringify({database:test?'creator_test':'echolink_local',...result}));
  }finally{await db.end();}
 }
 const runtime=new pg.Client({connectionString:settings.LOCAL_POSTGRES_DATABASE_URL});await runtime.connect();try{const role=(await runtime.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];if(role.rolsuper||role.rolbypassrls)throw new Error('Runtime role must enforce tenant isolation.');console.log(JSON.stringify({localPostgresReady:true,port:55432,runtimeSuperuser:false,rlsBypass:false,existingNeonDataImported:false,activeDatabaseChanged:false,publishingEnabled:false}));}finally{await runtime.end();}
}catch(error){console.error('Local PostgreSQL setup:',error.code||error.message);process.exitCode=1;}
