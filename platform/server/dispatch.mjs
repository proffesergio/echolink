import {transaction} from './db.mjs';
import {tickAutomations} from './jobs.mjs';
// n8n is an optional coarse dispatcher. Repeated webhook/manual calls must not
// start another source scan; publication remains in the precise worker queue.
export async function guardedDispatch(){
 const allowed=await transaction(null,async db=>{
  if(!(await db.query("SELECT pg_try_advisory_xact_lock(hashtextextended('creator:external-dispatch',0)) AS acquired")).rows[0].acquired)return false;
  const last=(await db.query("SELECT value FROM creator.platform_settings WHERE key='external-dispatch'")).rows[0]?.value?.checkedAt;
  const now=(await db.query('SELECT now() AS at')).rows[0].at;
  if(last&&+now-+new Date(last)<5*60000)return false;
  await db.query("INSERT INTO creator.platform_settings(key,value) VALUES('external-dispatch',jsonb_build_object('checkedAt',$1::text)) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",[now.toISOString()]);return true;
 },{owner:true});
 return allowed?{...await tickAutomations(),skipped:false}:{queued:0,skipped:true,reason:'A dispatch check already ran within the five-minute safeguard interval.'};
}
