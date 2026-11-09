import {Queue,Worker,DelayedError} from 'bullmq';
import IORedis from 'ioredis';
import {transaction} from './db.mjs';
const delivery=new Set(['publish','manual_handoff','publish_instagram','post_link_comment','apply_page_brand','notify_approval']);
export const queueJobId=task=>'task-'+task.id+'-'+new Date(task.not_before).getTime();
export const queueDelay=(task,now=Date.now())=>Math.max(0,new Date(task.not_before).getTime()-now);
// SQL is the durable outbox and publication ledger. Redis transports IDs only.
// A lost Redis job is reconstructed; claiming its SQL row prevents two sends.
export async function startRedisQueue({runTask,tick,onError=()=>{}}){
 const options={maxRetriesPerRequest:null,enableReadyCheck:true,lazyConnect:true};
 const connection=new IORedis(process.env.REDIS_URL,options);connection.on('error',()=>onError());await connection.connect();
 const prefix=process.env.PLATFORM_QUEUE_PREFIX||'echolink-v2',queues=[new Queue('prepare',{connection,prefix}),new Queue('delivery',{connection,prefix})];
 const workers=queues.map((queue,i)=>new Worker(queue.name,async(job,token)=>{const remaining=await transaction(null,async db=>(await db.query("SELECT GREATEST(0,extract(epoch from(not_before-now()))*1000) AS delay FROM creator.tasks WHERE id=$1 AND status='queued'",[job.data.taskId])).rows[0]?.delay,{owner:true});if(Number(remaining)>0){await job.moveToDelayed(Date.now()+Number(remaining),token);throw new DelayedError();}return runTask(job.data.taskId);},{connection,prefix,concurrency:1,lockDuration:600000,autorun:true}));
 for(const worker of workers)worker.on('error',()=>onError());
 let stopped=false,pumping=false;
 const pump=async()=>{if(stopped||pumping)return;pumping=true;try{
  await tick();const rows=await transaction(null,async db=>(await db.query("SELECT id,kind,not_before FROM creator.tasks WHERE status='queued' AND not_before<now()+interval '7 days' ORDER BY not_before LIMIT 200")).rows,{owner:true});
  for(const task of rows)await queues[delivery.has(task.kind)?1:0].add(task.kind,{taskId:task.id},{jobId:queueJobId(task),delay:queueDelay(task),attempts:1,removeOnComplete:{age:86400,count:1000},removeOnFail:{age:604800,count:1000}});
 }catch{onError();}finally{pumping=false;}};
 const timer=setInterval(pump,15000);timer.unref?.();await pump();
 return async()=>{stopped=true;clearInterval(timer);await Promise.all(workers.map(w=>w.close()));await Promise.all(queues.map(q=>q.close()));await connection.quit();};
}
