import assert from 'node:assert/strict';

// Caller owns an isolated fixture transaction; never submit a model or publish.
export async function verifyContentLifecycle(db,w,page){
 const post=(await db.query("INSERT INTO creator.posts(workspace_id,page_id,type,title) VALUES($1,$2,'original','Content lifecycle fixture') RETURNING id",[w,page])).rows[0];
 const state=async expected=>assert.equal((await db.query('SELECT content_status FROM creator.posts WHERE workspace_id=$1 AND id=$2',[w,post.id])).rows[0].content_status,expected);
 const tasks=[];
 try{
  await state('DRAFT');
  const enqueue=async kind=>{const task=(await db.query('INSERT INTO creator.tasks(workspace_id,page_id,post_id,kind) VALUES($1,$2,$3,$4) RETURNING id',[w,page,post.id,kind])).rows[0];tasks.push(task.id);return task.id;};
  const generation=await enqueue('generate');await state('PREPARING');
  await db.query("UPDATE creator.posts SET caption='Complete fixture caption',status='review' WHERE workspace_id=$1 AND id=$2",[w,post.id]);await state('PREPARING');
  const render=await enqueue('creative');
  await db.query("UPDATE creator.tasks SET status='succeeded' WHERE id=$1",[generation]);await state('PREPARING');
  await db.query("UPDATE creator.tasks SET status='succeeded' WHERE id=$1",[render]);await state('NEED_ATTENTION');
  await db.query("UPDATE creator.posts SET status='approved' WHERE workspace_id=$1 AND id=$2",[w,post.id]);await state('APPROVED');
  await db.query("UPDATE creator.posts SET last_error='Guardrail needs review' WHERE workspace_id=$1 AND id=$2",[w,post.id]);await state('NEED_ATTENTION');
  await db.query("UPDATE creator.posts SET status='scheduled',last_error=NULL WHERE workspace_id=$1 AND id=$2",[w,post.id]);await state('SCHEDULED');
  await db.query("UPDATE creator.posts SET status='unknown' WHERE workspace_id=$1 AND id=$2",[w,post.id]);await state('NEED_ATTENTION');
  await db.query("UPDATE creator.posts SET status='published',last_error='Historical warning' WHERE workspace_id=$1 AND id=$2",[w,post.id]);await state('PUBLISHED');
  assert.equal((await db.query('SELECT status FROM creator.posts WHERE id=$1',[post.id])).rows[0].status,'published');
 }finally{
  await db.query('DELETE FROM creator.tasks WHERE workspace_id=$1 AND id=ANY($2::uuid[])',[w,tasks]);
  await db.query('DELETE FROM creator.posts WHERE workspace_id=$1 AND id=$2',[w,post.id]);
 }
}
