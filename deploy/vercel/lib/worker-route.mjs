import {neon} from '@neondatabase/serverless';
import pg from 'pg';
let cached,until=0,pool;
export function registryOptions(uri,caBase64){
 const url=new URL(uri);for(const key of [...url.searchParams.keys()])if(key.toLowerCase().startsWith('ssl')||key==='uselibpqcompat')url.searchParams.delete(key);
 return {connectionString:url.href,max:1,connectionTimeoutMillis:5000,idleTimeoutMillis:1000,statement_timeout:5000,query_timeout:5500,ssl:{rejectUnauthorized:true,...(caBase64?{ca:Buffer.from(caBase64,'base64').toString()}:{})}};
}
export async function workerOrigin(fallback){
 if(!process.env.WORKER_REGISTRY_URL)return fallback;
 if(cached&&Date.now()<until)return cached;
 try{
  let rows;
  if(process.env.WORKER_REGISTRY_PROVIDER==='postgres'){
   if(!pool){pool=new pg.Pool(registryOptions(process.env.WORKER_REGISTRY_URL,process.env.WORKER_REGISTRY_CA_CERT_BASE64));pool.on('error',()=>{});}
   rows=(await pool.query("SELECT origin FROM creator.worker_routes WHERE id='primary' AND heartbeat_at>now()-interval '5 minutes'")).rows;
  }else{const sql=neon(process.env.WORKER_REGISTRY_URL,{fetchOptions:{signal:AbortSignal.timeout(6000)}});rows=await sql`SELECT origin FROM creator.worker_routes WHERE id='primary' AND heartbeat_at>now()-interval '5 minutes'`;}
  const origin=rows[0]?.origin,url=origin&&new URL(origin);
  if(url?.protocol==='https:'&&url.origin===origin&&!url.username&&!url.password){cached=origin;until=Date.now()+60000;return origin;}
 }catch{ /* An existing configured route remains usable during database wake-up. */ }
 // Cache misses too: an unavailable registry must not receive a query per asset.
 cached=fallback;until=Date.now()+15000;return fallback;
}
