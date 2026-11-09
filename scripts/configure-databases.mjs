// Operator-only bootstrap. Never prints connection strings or certificate contents.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {databaseDriver} from '../platform/server/database-driver.mjs';
import {parseDatabaseSecret,databaseClientOptions,sealDatabaseSecret,probeDatabase} from '../platform/server/database-profiles.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const load=async file=>parseEnv(await readFile(resolve(root,file),'utf8'));
export async function databaseSettings(){
 const raw=await readFile(resolve(root,'.env.local'),'utf8'),main=parseEnv(raw),app=await load('platform/.env.local'),local=await load('platform/.env.postgres.local');
 const pasted=raw.split(/\r?\n/).findLast(line=>line.includes('postgres')&&line.includes('aivencloud'));
 const uri=main.AIVEN_DATABASE_URL||(pasted?pasted.slice(pasted.indexOf('postgres')).trim().replace(/['";]+$/,''):'');
 const ca=main.AIVEN_CA_CERT_BASE64?Buffer.from(main.AIVEN_CA_CERT_BASE64,'base64').toString():await readFile(main.AIVEN_CA_CERT_PATH||resolve(root,'ca.pem'),'utf8');
 parseDatabaseSecret(uri,ca);
 return {raw,main,app,local,values:{AIVEN_DATABASE_URL:uri,AIVEN_DATABASE_URL_UNPOOLED:main.AIVEN_DATABASE_URL_UNPOOLED||uri,AIVEN_CA_CERT_BASE64:Buffer.from(ca).toString('base64'),NEON_DATABASE_URL:app.NEON_DATABASE_URL||main.NEON_DATABASE_URL||app.DATABASE_URL,NEON_DATABASE_URL_UNPOOLED:app.NEON_DATABASE_URL_UNPOOLED||main.NEON_DATABASE_URL_UNPOOLED||app.DATABASE_URL_UNPOOLED||app.DATABASE_URL,LOCAL_POSTGRES_DATABASE_URL:main.LOCAL_POSTGRES_DATABASE_URL||local.LOCAL_POSTGRES_DATABASE_URL,LOCAL_POSTGRES_DATABASE_URL_UNPOOLED:main.LOCAL_POSTGRES_DATABASE_URL_UNPOOLED||local.LOCAL_POSTGRES_DATABASE_URL_UNPOOLED}};
}
export async function updateEnv(file,values){
 let text=await readFile(resolve(root,file),'utf8');
 // Remove the pasted console tutorial, keeping all genuine environment assignments.
 if(file==='.env.local'){const marker=text.indexOf('Connect to echolink');if(marker>=0){const start=text.lastIndexOf('################################',marker);text=text.slice(0,start>=0?start:marker)+text.slice(marker).split(/\r?\n/).filter(l=>/^[A-Z][A-Z0-9_]*=/.test(l)).join('\n')+'\n';}}
 for(const [key,value] of Object.entries(values)){const line=key+'='+JSON.stringify(value),rx=new RegExp('^'+key+'=.*$','m');text=rx.test(text)?text.replace(rx,()=>line):text.trimEnd()+'\n'+line+'\n';}
 await writeFile(resolve(root,file),text,{mode:0o600});
}
export async function profilesFromEnvironment(settings){
 return [['local','Local PostgreSQL','tcp','LOCAL_POSTGRES_DATABASE_URL',''],['aiven','Aiven PostgreSQL','tcp','AIVEN_DATABASE_URL',Buffer.from(settings.values.AIVEN_CA_CERT_BASE64,'base64').toString()],['neon','Neon PostgreSQL',settings.app.NEON_DATABASE_TRANSPORT||settings.main.NEON_DATABASE_TRANSPORT||'websocket','NEON_DATABASE_URL','']].map(([provider,name,transport,environment_key,caCertificate])=>({provider,name,transport,environment_key,secret_cipher:sealDatabaseSecret(parseDatabaseSecret(settings.values[environment_key],caCertificate))}));
}
export async function seedProfiles(db,profiles){
 await db.query('BEGIN');try{await db.query("SELECT set_config('creator.super_admin','true',true)");for(const p of profiles){const result=await probeDatabase(p);await db.query("INSERT INTO creator.database_profiles(name,provider,transport,environment_key,secret_cipher,status,last_test_at,last_test_result) VALUES($1,$2,$3,$4,$5,$6,now(),$7) ON CONFLICT(environment_key) DO UPDATE SET secret_cipher=EXCLUDED.secret_cipher,status=EXCLUDED.status,last_test_at=now(),last_test_result=EXCLUDED.last_test_result,updated_at=now()",[p.name,p.provider,p.transport,p.environment_key,p.secret_cipher,result.ok?'verified':'unavailable',result]);console.log(JSON.stringify({provider:p.provider,...result}));}await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const settings=await databaseSettings();process.env.PLATFORM_ENCRYPTION_KEY=settings.app.PLATFORM_ENCRYPTION_KEY;const mode=process.argv[2]||'check';
  if(mode==='normalize'){await mkdir(resolve(root,'.codex'),{recursive:true});await writeFile(resolve(root,'.codex/env-before-databases-'+Date.now()),settings.raw,{mode:0o600});await updateEnv('.env.local',settings.values);await updateEnv('platform/.env.local',settings.values);console.log('Database variables normalized in both private env files. Active DATABASE_URL unchanged.');}
  else if(mode==='check'){for(const p of await profilesFromEnvironment(settings))console.log(JSON.stringify({provider:p.provider,...await probeDatabase(p)}));}
  else if(mode==='seed-local'){const driver=databaseDriver('tcp'),db=new driver.Client(databaseClientOptions(parseDatabaseSecret(settings.local.LOCAL_POSTGRES_DATABASE_URL)));await db.connect();try{await seedProfiles(db,await profilesFromEnvironment(settings));}finally{await db.end();}}
  else throw new Error('Use normalize, check, or seed-local.');
 }catch(error){console.error('Database configuration failed:',error.code||'configuration; check URI and CA file');process.exitCode=1;}
}
