import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
let pool;
export async function registerWorkerRoute(origin){
 const url=new URL(origin);if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password)throw new Error('Invalid worker origin');
 if(!pool){const settings=parseEnv(await readFile(new URL('../platform/.env.local',import.meta.url),'utf8'));pool=new pg.Pool({connectionString:settings.DATABASE_URL,max:1,connectionTimeoutMillis:8000,idleTimeoutMillis:10000,statement_timeout:8000});pool.on('error',()=>{});}
 const db=await pool.connect();try{await db.query('BEGIN');await db.query("SELECT set_config('creator.super_admin','true',true)");await db.query("INSERT INTO creator.worker_routes(id,origin) VALUES('primary',$1) ON CONFLICT(id) DO UPDATE SET origin=$1,heartbeat_at=now()",[origin]);await db.query('COMMIT');}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
}
