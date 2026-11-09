import {transaction,workspaceLock} from './db.mjs';
import {AppError} from './errors.mjs';
export async function entitlements(client,workspaceId,{at,allowExpired=false}={}){
  const row=(await client.query(`SELECT s.*,now() AS database_now,p.name AS plan_name,p.page_limit,p.post_limit,p.generation_limit,p.period_days,w.status AS workspace_status,w.trial_ends_at
    FROM creator.subscriptions s JOIN creator.plans p ON p.id=s.plan_id JOIN creator.workspaces w ON w.id=s.workspace_id WHERE s.workspace_id=$1`,[workspaceId])).rows[0];
  if(!row)throw new AppError(409,'Choose a plan before continuing.');
  row.expired=!['active','trialing'].includes(row.status)||new Date(row.period_end)<=new Date(at||row.database_now);
  if(!allowExpired&&(row.expired||row.workspace_status!=='active'))throw new AppError(402,row.workspace_status!=='active'?'This workspace is suspended.':'Your plan or seven-day trial has ended. Choose a package to continue.','plan_inactive');
  const used=(await client.query("SELECT count(*)::int AS used FROM creator.usage_reservations WHERE workspace_id=$1 AND period_start=$2 AND status IN ('reserved','consumed','unknown')",[workspaceId,row.period_start])).rows[0].used;
  const pages=(await client.query('SELECT count(*)::int AS count FROM creator.pages WHERE workspace_id=$1',[workspaceId])).rows[0].count;
  return {...row,posts_used:used,pages_used:pages,posts_remaining:Math.max(0,row.post_limit-used),pages_remaining:Math.max(0,row.page_limit-pages)};
}
export async function requirePageCapacity(client,workspaceId){
  await workspaceLock(client,workspaceId);const plan=await entitlements(client,workspaceId);
  if(plan.pages_used>=plan.page_limit)throw new AppError(402,`Your ${plan.plan_name} plan allows ${plan.page_limit} Page(s). Upgrade before adding another.`,'page_limit');return plan;
}
export async function reservePublication(client,workspaceId,postId,scheduledAt){
  await workspaceLock(client,workspaceId);const plan=await entitlements(client,workspaceId);
  if(scheduledAt&&new Date(scheduledAt)>=new Date(plan.period_end))throw new AppError(402,'Choose a publication time within your active plan period.','plan_expiry');
  const prior=(await client.query('SELECT * FROM creator.usage_reservations WHERE workspace_id=$1 AND post_id=$2 FOR UPDATE',[workspaceId,postId])).rows[0];
  if(prior&&prior.status==='consumed')throw new AppError(409,'This post was already published.');
  if(prior&&prior.status==='unknown')throw new AppError(409,'Reconcile the unknown publication before retrying.');
  const existing=prior&&prior.status==='reserved'&&new Date(prior.period_start).getTime()===new Date(plan.period_start).getTime();
  if(!existing&&plan.posts_remaining<1)throw new AppError(402,`Your ${plan.plan_name} allowance is used: ${plan.post_limit} posts in this plan period. Cancel an unsent reservation or upgrade.`,'post_limit');
  await client.query(`INSERT INTO creator.usage_reservations(workspace_id,post_id,period_start,status) VALUES($1,$2,$3,'reserved') ON CONFLICT(workspace_id,post_id)
    DO UPDATE SET period_start=EXCLUDED.period_start,status='reserved',updated_at=now()`,[workspaceId,postId,plan.period_start]);
  return plan;
}
export const releasePublication=(client,workspaceId,postId)=>client.query("UPDATE creator.usage_reservations SET status='released',updated_at=now() WHERE workspace_id=$1 AND post_id=$2 AND status='reserved'",[workspaceId,postId]);
export async function requireGenerationCapacity(client,workspaceId){
  await workspaceLock(client,workspaceId);const plan=await entitlements(client,workspaceId);
  const {count}=(await client.query("SELECT count(*)::int AS count FROM creator.tasks WHERE workspace_id=$1 AND kind IN ('generate','write_article','creative','render_reel','design_page_brand') AND created_at>=$2 AND status<>'canceled'",[workspaceId,plan.period_start])).rows[0];
  if(count>=plan.generation_limit)throw new AppError(402,`This package allows ${plan.generation_limit} generation tasks per period. Upgrade or contact the owner.`,'generation_limit');return plan;
}
export const workspaceEntitlements=workspaceId=>transaction(workspaceId,client=>entitlements(client,workspaceId,{allowExpired:true}));
