import {EDITORIAL_HOLD_SQL} from '../shared/content-status.mjs';

// Holds stay visible without exhausting the working queue. Clean drafts awaiting
// human approval still count, as do explicit retries with a prior error.
export const actionableBacklogSQL=`SELECT count(*)::int AS count FROM creator.posts
 WHERE workspace_id=$1 AND page_id=$2 AND status IN ('draft','review','approved','scheduled','ready_manual','failed')
 AND ($3::boolean=false OR status NOT IN ('scheduled','ready_manual'))
 AND deleted_at IS NULL AND archived_at IS NULL
 AND (content_status='PREPARING' OR NOT COALESCE(${EDITORIAL_HOLD_SQL},false))`;
export const catalogCandidatesSQL=`SELECT p.* FROM creator.products p
 WHERE p.workspace_id=$1 AND p.website_id=$2 AND p.available AND NOT EXISTS(
 SELECT 1 FROM creator.posts s WHERE s.workspace_id=$1 AND s.product_id=p.id AND s.page_id=$3::uuid)
 ORDER BY p.fetched_at DESC,p.id DESC LIMIT 300`;
export const catalogAllocatedSQL="SELECT count(*)::int AS count FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND seo->'catalogBatch'->>'day'=$3";

export function catalogRefreshDue(rule,page,now=new Date()) {
 return page.kind==='ecommerce'&&!!page.website_id&&rule.enabled!==false
  &&(!rule.catalog_checked_at||+new Date(rule.catalog_checked_at)<=+now-86400000)
  &&(!rule.catalog_refresh_after||+new Date(rule.catalog_refresh_after)<=+now);
}
export const catalogDailyRemaining=(rule,page,allocated=0)=>Math.max(0,Math.min(rule.daily_target,page.daily_cap)-allocated);

// No inference work here: planning must not wait for the preparation lane.
export function planningTick({recover,resume,automations,now=Date.now,intervalMs=60000}) {
 let last=-Infinity,active=false;
 return async()=>{
  if(active||now()-last<intervalMs)return false;
  active=true;
  try {await recover();await resume();await automations();last=now();return true;}
  finally {active=false;}
 };
}
