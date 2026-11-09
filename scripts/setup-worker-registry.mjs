import {randomBytes} from 'node:crypto';
import {databaseSettings,updateEnv} from './configure-databases.mjs';
import {databaseClientOptions,parseDatabaseSecret} from '../platform/server/database-profiles.mjs';
import pg from '../platform/node_modules/pg/lib/index.js';
try{const s=await databaseSettings(),ca=Buffer.from(s.values.AIVEN_CA_CERT_BASE64,'base64').toString();
 const adminURL=s.main.AIVEN_STANDBY_DATABASE_URL_UNPOOLED;if(!adminURL)throw new Error('Initialize the Aiven standby first.');
 const db=new pg.Client(databaseClientOptions(parseDatabaseSecret(adminURL,ca)));await db.connect();let reader,writer;
 try{for(const [role,key,write]of [['echolink_route_reader','WORKER_REGISTRY_URL',false],['echolink_route_writer','WORKER_REGISTRY_WRITE_URL',true]]){
  const exists=(await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount;let uri=s.main[key];
  if(exists&&(!uri||new URL(uri).username!==role))throw Object.assign(new Error('Original registry role secret is required.'),{code:'existing_role'});
  if(!exists){const password=randomBytes(32).toString('hex');await db.query('CREATE ROLE '+role+" LOGIN PASSWORD '"+password+"' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS");const url=new URL(adminURL);url.username=role;url.password=password;uri=url.href;await updateEnv('.env.local',{[key]:uri});}
  await db.query('GRANT USAGE ON SCHEMA creator TO '+role);await db.query('GRANT SELECT'+(write?',INSERT,UPDATE':'')+' ON creator.worker_routes TO '+role);
  const policy=write?'route_writer':'route_reader';if(!(await db.query("SELECT 1 FROM pg_policies WHERE schemaname='creator' AND tablename='worker_routes' AND policyname=$1",[policy])).rowCount)await db.query('CREATE POLICY '+policy+' ON creator.worker_routes TO '+role+" USING(id='primary')"+(write?" WITH CHECK(id='primary')":''));
  if(write)writer=uri;else reader=uri;
 }}finally{await db.end();}
 const values={WORKER_REGISTRY_URL:reader,WORKER_REGISTRY_WRITE_URL:writer,WORKER_REGISTRY_PROVIDER:'postgres',WORKER_REGISTRY_CA_CERT_BASE64:s.values.AIVEN_CA_CERT_BASE64};await updateEnv('.env.local',values);await updateEnv('platform/.env.local',values);
 const check=new pg.Client(databaseClientOptions(parseDatabaseSecret(reader,ca)));await check.connect();try{await check.query('SELECT origin FROM creator.worker_routes LIMIT 1');let denied=false;try{await check.query('SELECT id FROM creator.posts LIMIT 1');}catch(e){denied=e.code==='42501';}if(!denied)throw new Error('Registry reader must not read tenant records.');console.log(JSON.stringify({registryReady:true,provider:'aiven',readerHasTenantAccess:false,TLSVerified:true}));}finally{await check.end();}
}catch(error){console.error('Registry setup failed:',error.code||'configuration');process.exitCode=1;}
