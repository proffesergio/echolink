import {databaseDriver} from '../platform/server/database-driver.mjs';
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {databaseClientOptions,parseDatabaseSecret} from '../platform/server/database-profiles.mjs';
let pool,lastOrigin,lastWrite=0;
export async function registerWorkerRoute(origin){
 const url=new URL(origin);if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password)throw new Error('Invalid worker origin');
 if(origin===lastOrigin&&Date.now()-lastWrite<60000)return;
 if(!pool){const settings=parseEnv(await readFile(new URL('../platform/.env.local',import.meta.url),'utf8')),separate=!!settings.WORKER_REGISTRY_WRITE_URL,transport=separate?'tcp':settings.PLATFORM_DATABASE_TRANSPORT||'tcp',driver=databaseDriver(transport),ca=separate&&settings.WORKER_REGISTRY_CA_CERT_BASE64?Buffer.from(settings.WORKER_REGISTRY_CA_CERT_BASE64,'base64').toString():'';pool=new driver.Pool(databaseClientOptions(parseDatabaseSecret(settings.WORKER_REGISTRY_WRITE_URL||settings.DATABASE_URL,ca),{transport,max:1}));pool.on('error',()=>{});}
 const db=await pool.connect();try{await db.query('BEGIN');await db.query("SELECT set_config('creator.super_admin','true',true)");await db.query("INSERT INTO creator.worker_routes(id,origin) VALUES('primary',$1) ON CONFLICT(id) DO UPDATE SET origin=$1,heartbeat_at=now()",[origin]);await db.query('COMMIT');lastOrigin=origin;lastWrite=Date.now();}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
}
