import '../platform/server/env.mjs';
import {transaction,audit,closeDatabase} from '../platform/server/db.mjs';
import {normalizeProductCurrency} from '../platform/server/prompts.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
try{
 const result=await transaction(null,async db=>{
  const rules=(await db.query("SELECT r.*,p.name AS page_name FROM creator.automation_rules r JOIN creator.pages p ON p.id=r.page_id JOIN creator.workspaces w ON w.id=r.workspace_id JOIN creator.accounts a ON a.id=w.owner_id WHERE lower(a.email)=$1",[(process.env.PLATFORM_OWNER_EMAIL||'').toLowerCase()])).rows;
  const drafts=(await db.query("SELECT s.*,pr.currency FROM creator.posts s JOIN creator.products pr ON pr.id=s.product_id AND pr.workspace_id=s.workspace_id JOIN creator.workspaces w ON w.id=s.workspace_id JOIN creator.accounts a ON a.id=w.owner_id WHERE lower(a.email)=$1 AND s.status IN ('draft','review') AND pr.currency='BDT' AND (s.caption LIKE '%₹%' OR s.caption~'\\m(INR|Rs)\\M' OR s.seo->'channelCaptions'->>'instagram' LIKE '%₹%')",[(process.env.PLATFORM_OWNER_EMAIL||'').toLowerCase()])).rows;
  await mkdir(new URL('../.codex/backups/',import.meta.url),{recursive:true});await writeFile(new URL('../.codex/backups/day-coverage-'+Date.now()+'.json',import.meta.url),JSON.stringify({rules,drafts},null,2),{mode:0o600});
  for(const rule of rules){const window={...rule.generation_window,enabled:true,start:'22:00',end:'07:00',emergency_refill:true};await db.query("UPDATE creator.automation_rules SET generation_mode='buffered',buffer_hours=24,generation_window=$2,refill_until=NULL,next_run_at=now(),last_message='Overnight preparation targets the next 24 hours. Daytime rescue remains enabled when nearly empty.' WHERE id=$1",[rule.id,window]);await audit(db,rule.workspace_id,null,'automation.day_coverage','automation_rule',rule.id,{bufferHours:24,window});}
  let corrected=0;for(const draft of drafts){const caption=normalizeProductCurrency(draft.caption,draft),seo={...draft.seo};if(seo.channelCaptions?.instagram)seo.channelCaptions={...seo.channelCaptions,instagram:normalizeProductCurrency(seo.channelCaptions.instagram,draft)};if(caption===draft.caption&&JSON.stringify(seo)===JSON.stringify(draft.seo))continue;
   const saved=await db.query("UPDATE creator.posts SET caption=$3,seo=$4,version=version+1,approved_version=NULL,updated_at=now() WHERE workspace_id=$1 AND id=$2 AND version=$5 AND status IN ('draft','review')",[draft.workspace_id,draft.id,caption,seo,draft.version]);corrected+=saved.rowCount;
  }
  return {routines:rules.map(r=>({page:r.page_name,bufferHours:24,generation:'22:00–07:00 Asia/Dhaka',daytimeRescue:true,enabled:r.enabled})),correctedUnpublishedCaptions:corrected};
 },{owner:true});console.log(JSON.stringify(result,null,2));
}finally{await closeDatabase();}
