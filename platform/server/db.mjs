import './env.mjs';
import pg from 'pg';
import {AppError} from './errors.mjs';
let pool;
export function database(){
  if(!process.env.DATABASE_URL)throw new AppError(503,'The local platform database is not configured.');
  if(!pool){pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:6,connectionTimeoutMillis:15000,idleTimeoutMillis:15000,statement_timeout:30000,keepAlive:true});pool.on('error',()=>console.error('Platform database idle connection interrupted. The next request will reconnect.'));}return pool;
}
export const query=(sql,args=[])=>database().query(sql,args);
export async function transaction(workspaceId,fn,{owner=false}={}){
  const client=await database().connect();
  try{await client.query('BEGIN');await client.query("SELECT set_config('creator.workspace_id',$1,true),set_config('creator.super_admin',$2,true)",[workspaceId||'',owner?'true':'false']);
    const result=await fn(client);await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export const tenantQuery=(workspaceId,sql,args=[])=>transaction(workspaceId,client=>client.query(sql,args));
export const workspaceLock=(client,id)=>client.query("SELECT pg_advisory_xact_lock(hashtextextended('creator:'||$1,0))",[id]);
export const audit=(client,workspaceId,actor,action,type,id,detail={})=>client.query('INSERT INTO creator.activity(workspace_id,actor_id,action,resource_type,resource_id,detail) VALUES($1,$2,$3,$4,$5,$6)',[workspaceId,actor?.id||null,action,type,id?String(id):null,JSON.stringify(detail)]);
export async function closeDatabase(){await pool?.end();pool=undefined;}
