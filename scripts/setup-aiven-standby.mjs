import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {databaseSettings,updateEnv,profilesFromEnvironment,seedProfiles} from './configure-databases.mjs';
import {databaseClientOptions,parseDatabaseSecret} from '../platform/server/database-profiles.mjs';
import pg from '../platform/node_modules/pg/lib/index.js';
const runtimeRole='creator_runtime',databaseName='echolink_standby';
const run=(file,environment)=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[file],{env:environment,windowsHide:true,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('setup command failed')));});
try{
 const s=await databaseSettings(),ca=Buffer.from(s.values.AIVEN_CA_CERT_BASE64,'base64').toString();
 const admin=new pg.Client(databaseClientOptions(parseDatabaseSecret(s.main.AIVEN_SERVICE_ADMIN_URL||s.values.AIVEN_DATABASE_URL_UNPOOLED,ca)));await admin.connect();
 let runtimeURL=s.main.AIVEN_STANDBY_DATABASE_URL;
 try{
  const exists=(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[databaseName])).rowCount;
  const role=(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[runtimeRole])).rowCount;
  if(role&&!runtimeURL)throw Object.assign(new Error('Existing runtime role requires its original stored secret; not reset.'),{code:'existing_role'});
  if(!role){const password=randomBytes(32).toString('hex');await admin.query('CREATE ROLE '+runtimeRole+" LOGIN PASSWORD '"+password+"' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS");const uri=new URL(s.values.AIVEN_DATABASE_URL_UNPOOLED);uri.username=runtimeRole;uri.password=password;uri.pathname='/'+databaseName;runtimeURL=uri.href;await updateEnv('.env.local',{AIVEN_STANDBY_DATABASE_URL:runtimeURL});}
  if(!exists)await admin.query('CREATE DATABASE '+databaseName);
 }finally{await admin.end();}
 const adminURI=new URL(s.values.AIVEN_DATABASE_URL_UNPOOLED);adminURI.pathname='/'+databaseName;
 const environment={...s.app,...process.env,DATABASE_URL:adminURI.href,DATABASE_URL_UNPOOLED:adminURI.href,DATABASE_CA_CERT_BASE64:s.values.AIVEN_CA_CERT_BASE64,DATABASE_POOL_MAX:'2',PLATFORM_DATABASE_TRANSPORT:'tcp',PLATFORM_BRANCH:'echolink-platform-local',PLATFORM_PUBLISHING_ENABLED:'false',SMTP_HOST:''};
 await run('platform/scripts/migrate.mjs',environment);await run('platform/scripts/setup-auth.mjs',environment);
 const db=new pg.Client(databaseClientOptions(parseDatabaseSecret(adminURI.href,ca)));await db.connect();try{
  await db.query('GRANT USAGE ON SCHEMA creator,public TO creator_runtime');await db.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA creator TO creator_runtime');await db.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA creator TO creator_runtime');await db.query('GRANT SELECT,INSERT,UPDATE,DELETE ON public.auth_user,public.auth_account,public.auth_session,public.auth_verification TO creator_runtime');
 }finally{await db.end();}
 const values={AIVEN_STANDBY_DATABASE_URL:runtimeURL,AIVEN_STANDBY_DATABASE_URL_UNPOOLED:adminURI.href};await updateEnv('.env.local',values);await updateEnv('platform/.env.local',values);
 process.env.PLATFORM_ENCRYPTION_KEY=s.app.PLATFORM_ENCRYPTION_KEY;
 const runtime=new pg.Client(databaseClientOptions(parseDatabaseSecret(runtimeURL,ca)));await runtime.connect();try{const role=(await runtime.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];if(role.rolsuper||role.rolbypassrls)throw new Error('Runtime role must enforce RLS');const profiles=await profilesFromEnvironment({...s,values:{...s.values,AIVEN_DATABASE_URL:runtimeURL}});await seedProfiles(runtime,profiles);console.log(JSON.stringify({aivenStandbyReady:true,verifiedTLS:true,runtimeBypassesRLS:false,productionDataImported:false,activePrimaryChanged:false}));}finally{await runtime.end();}
}catch(error){console.error('Aiven staging setup failed:',error.code||'configuration');process.exitCode=1;}
