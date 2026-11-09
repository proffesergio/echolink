import {z} from 'zod';
import {databaseDriver} from './database-driver.mjs';
import {encryptSecret,decryptSecret} from './vault.mjs';
import {AppError} from './errors.mjs';
const aad='operator:database-profiles';
export const databaseProfileSchema=z.object({name:z.string().trim().min(1).max(100),provider:z.enum(['local','neon','aiven','postgres','supabase']),purpose:z.enum(['standby','primary_candidate','dedicated_candidate']).default('standby'),transport:z.enum(['tcp','websocket']).default('tcp'),max_connections:z.number().int().min(1).max(6).default(2),expires_at:z.string().datetime().nullable().optional(),connectionURL:z.string().max(5000).optional(),caCertificate:z.string().max(30000).optional()});
export function parseDatabaseSecret(connectionURL,caCertificate=''){
 let url;try{url=new URL(connectionURL);}catch{throw new AppError(400,'Enter a PostgreSQL connection URI.');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.username||!url.password||!url.pathname.slice(1))throw new AppError(400,'Include the database, username, password and host in a PostgreSQL URI.');
 if(/(?:<|\{)(?:redacted|password|secret|your[^>}]*)[>}]|YOUR_PASSWORD/i.test(decodeURIComponent(url.password)))throw new AppError(400,'Replace the password placeholder with the real service secret.');
 if(caCertificate&&!/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----\s*$/.test(caCertificate.trim()))throw new AppError(400,'Use a PEM CA certificate downloaded from the database provider.');
 return {connectionURL:url.href,caCertificate:caCertificate.trim()};
}
export function databaseClientOptions(secret,{transport='tcp',max=2}={}){
 const url=new URL(secret.connectionURL),local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(transport==='websocket'&&!url.hostname.endsWith('.neon.tech'))throw new AppError(400,'WebSocket database transport is supported only for Neon.');
 // Remove URI TLS overrides so require/allow cannot disable verification.
 for(const key of [...url.searchParams.keys()])if(key.toLowerCase().startsWith('ssl')||key.toLowerCase()==='uselibpqcompat')url.searchParams.delete(key);
 return {connectionString:url.href,max,connectionTimeoutMillis:8000,idleTimeoutMillis:10000,statement_timeout:10000,query_timeout:10000,...(!local&&transport==='tcp'?{ssl:{rejectUnauthorized:true,...(secret.caCertificate?{ca:secret.caCertificate}:{})}}:{})};
}
export const sealDatabaseSecret=secret=>encryptSecret(secret,aad);
export const openDatabaseSecret=profile=>decryptSecret(profile.secret_cipher,aad);
export function safeDatabaseProfile(profile){
 const {id,name,provider,purpose,transport,max_connections,expires_at,status,last_test_at,last_test_result,environment_key,created_at,updated_at}=profile;
 let destination='Unavailable';try{const u=new URL(openDatabaseSecret(profile).connectionURL);destination=u.hostname+(u.port?':'+u.port:'')+'/'+u.pathname.slice(1);}catch{}
 return {id,name,provider,purpose,transport,max_connections,expires_at,status,last_test_at,last_test_result,environment_key,created_at,updated_at,destination,hasCredentials:!!profile.secret_cipher};
}
export async function probeDatabase(profile,{driverFor=databaseDriver}={}){
 const driver=driverFor(profile.transport),db=new driver.Client(databaseClientOptions(openDatabaseSecret(profile),{transport:profile.transport}));const started=performance.now();
 db.on?.('error',()=>{}); // Connection failures are returned below, never an unhandled emitter error.
 try{
  await Promise.race([db.connect(),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Object.assign(new Error('Connection timed out'),{code:'connection_timeout'})),10000);timer.unref();})]);await db.query('BEGIN');
  const version=(await db.query("SELECT current_setting('server_version') AS version,pg_database_size(current_database())::text AS bytes,to_regclass('creator.migrations') IS NOT NULL AS platform_schema,to_regclass('public.auth_user') IS NOT NULL AND to_regclass('public.auth_session') IS NOT NULL AND to_regclass('public.auth_account') IS NOT NULL AND to_regclass('public.auth_verification') IS NOT NULL AS auth_schema")).rows[0];
  await db.query('CREATE TEMP TABLE echolink_probe(value integer) ON COMMIT DROP');await db.query('INSERT INTO echolink_probe VALUES(1)');const read=(await db.query('SELECT value FROM echolink_probe')).rows[0].value;
  const migrations=version.platform_schema?(await db.query('SELECT name FROM creator.migrations ORDER BY name')).rows.map(r=>r.name):[];
  await db.query('ROLLBACK');return {ok:read===1,version:version.version,storageBytes:Number(version.bytes),platformSchema:version.platform_schema,authSchema:version.auth_schema,migrations:migrations.length,latestMigration:migrations.at(-1)||null,roundTripMs:Math.round(performance.now()-started),verifiedTLS:!['localhost','127.0.0.1','[::1]'].includes(new URL(openDatabaseSecret(profile).connectionURL).hostname),message:'Read/write transaction passed and rolled back. No application records were created.'};
 }catch(error){return {ok:false,code:error.code||'connection_failed',quotaExceeded:/quota/i.test(error.message),message:/quota/i.test(error.message)?'Provider quota exhausted. Records cannot be read until access is restored.':/certificate|self.signed|issuer/i.test(error.message)?'Supply the provider CA certificate. Certificate verification remains enabled.':'Connection failed. Check the server, credentials, database name and allowed IPs.'};}finally{await Promise.race([db.end().catch(()=>{}),new Promise(resolve=>{const timer=setTimeout(resolve,1000);timer.unref();})]);}
}
