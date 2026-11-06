import {neon} from '@neondatabase/serverless';
let cached,until=0;
export async function workerOrigin(fallback){
 if(!process.env.WORKER_REGISTRY_URL)return fallback;
 if(cached&&Date.now()<until)return cached;
 try{
  const sql=neon(process.env.WORKER_REGISTRY_URL,{fetchOptions:{signal:AbortSignal.timeout(6000)}});
  const rows=await sql`SELECT origin FROM creator.worker_routes WHERE id='primary' AND heartbeat_at>now()-interval '3 minutes'`;
  const origin=rows[0]?.origin,url=origin&&new URL(origin);
  if(url?.protocol==='https:'&&url.origin===origin&&!url.username&&!url.password){cached=origin;until=Date.now()+15000;return origin;}
 }catch{ /* An existing configured route remains usable during database wake-up. */ }
 return fallback;
}
