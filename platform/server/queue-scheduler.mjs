// Keep delivery independent of preparation, including delayed receipt polling.
export const deliveryKinds=['publish','manual_handoff','publish_instagram','post_link_comment','apply_page_brand','notify_approval','sync_insights'];
const deliverySQL=deliveryKinds.map(kind=>`'${kind}'`).join(',');

// Least recently served profile first. A claim (including a failed/deferred
// attempt) consumes a turn, so retries and a continuous news pipeline cannot
// monopolize preparation. Recovery clears started_at for resumable text tasks,
// but preserves heartbeat_at, which was written atomically with their claim.
// Urgent/news preference remains within a profile's turn. Delivery timestamps
// never consume generation turns. NULL page IDs form a workspace-local bucket.
export const claimTaskSQL=`WITH profile_turns AS MATERIALIZED (
 SELECT workspace_id,page_id,max(COALESCE(started_at,heartbeat_at)) AS served_at FROM creator.tasks
 WHERE kind NOT IN (${deliverySQL}) AND COALESCE(started_at,heartbeat_at) IS NOT NULL
 GROUP BY workspace_id,page_id
) UPDATE creator.tasks SET
 status='running',started_at=now(),heartbeat_at=now(),
 lease_until=now()+interval '8 minutes',phase='Starting',
 result=CASE WHEN result?'waiting' THEN NULL ELSE result END
 WHERE id=(
  SELECT t.id FROM creator.tasks t LEFT JOIN profile_turns turns
   ON turns.workspace_id=t.workspace_id AND turns.page_id IS NOT DISTINCT FROM t.page_id
  WHERE t.status='queued' AND t.not_before<=now()
   AND ($3::uuid IS NULL OR t.id=$3)
   AND (NOT $1::boolean OR t.kind IN (${deliverySQL}))
   AND (NOT $2::boolean OR t.kind NOT IN (${deliverySQL}))
  ORDER BY CASE WHEN t.kind IN (${deliverySQL}) THEN 0 ELSE 1 END,
   CASE WHEN t.kind NOT IN (${deliverySQL}) THEN turns.served_at END ASC NULLS FIRST,
   CASE WHEN t.kind IN (${deliverySQL}) THEN 0
    WHEN t.input->>'urgent'='true' THEN 1
    WHEN t.input?'pipeline' AND EXISTS(
     SELECT 1 FROM creator.pages p WHERE p.id=t.page_id
      AND p.workspace_id=t.workspace_id AND p.kind='news' AND p.aggregation_enabled
    ) THEN 2 ELSE 3 END,
   t.not_before,t.created_at,t.id
  FOR UPDATE OF t SKIP LOCKED LIMIT 1
 ) RETURNING *`;

export async function claimTask(db,{publishOnly=false,excludePublish=false,taskId=null}={}){
 return (await db.query(claimTaskSQL,[publishOnly,excludePublish,taskId])).rows[0];
}

// Redis preparation IDs are wakeups for the SQL scheduler, not permission to
// bypass profile fairness. Delivery keeps its exact ID/deadline and receipts.
export const redisClaimOptions=(kind,taskId)=>deliveryKinds.includes(kind)?{taskId}:{excludePublish:true};
