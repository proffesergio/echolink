import test from 'node:test';
import assert from 'node:assert/strict';
import {claimTask,deliveryKinds,redisClaimOptions} from '../server/queue-scheduler.mjs';

test('Redis preparation uses fair SQL claims; delivery retains exact receipt IDs',()=>{
 for(const kind of ['aggregate','generate','write_article','creative','render_reel'])assert.deepEqual(redisClaimOptions(kind,'task'),{excludePublish:true});
 for(const kind of deliveryKinds)assert.deepEqual(redisClaimOptions(kind,'receipt'),{taskId:'receipt'});
});

test('claim options retain lane and task filters and return an empty queue safely',async()=>{
 const calls=[],db={query:async(sql,args)=>{calls.push(args);return {rows:[]};}};
 assert.equal(await claimTask(db),undefined);
 await claimTask(db,{publishOnly:true,taskId:'receipt'});
 await claimTask(db,{excludePublish:true});
 assert.deepEqual(calls,[[false,false,null],[true,false,'receipt'],[false,true,null]]);
});

// Optional disposable PostgreSQL engine: no live DB, credentials or providers.
// Set PGLITE_MODULE to an installed @electric-sql/pglite module to run SQL QA.
const modulePath=process.env.PGLITE_MODULE;
test('fair claim SQL against disposable PostgreSQL',{skip:!modulePath},async t=>{
 const {PGlite}=await import(modulePath),db=new PGlite();
 const uuid=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
 const w=uuid(1),other=uuid(2),pages=[uuid(11),uuid(12),uuid(13)];let sequence=100,turn=0;
 await db.exec(`CREATE SCHEMA creator;
  CREATE TABLE creator.pages(id uuid,workspace_id uuid,kind text,aggregation_enabled boolean);
  CREATE TABLE creator.tasks(id uuid PRIMARY KEY,workspace_id uuid,page_id uuid,kind text,
   status text DEFAULT 'queued',not_before timestamptz DEFAULT now(),created_at timestamptz DEFAULT now(),
   started_at timestamptz,heartbeat_at timestamptz,lease_until timestamptz,phase text,
   input jsonb DEFAULT '{}',result jsonb);`);
 for(const page of pages)await db.query('INSERT INTO creator.pages VALUES($1,$2,$3,true)',[page,w,page===pages[0]?'news':'ecommerce']);
 const reset=()=>db.exec('TRUNCATE creator.tasks');
 async function add(page,{workspace=w,kind='generate',input={},at='2000-01-01',status='queued',started=null}={}){
  const id=uuid(++sequence);await db.query('INSERT INTO creator.tasks(id,workspace_id,page_id,kind,input,not_before,status,started_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,workspace,page,kind,input,at,status,started]);return id;
 }
 async function take(options={excludePublish:true}){
  const task=await claimTask(db,options);
  // Deterministic successive turns independent of timestamp precision/speed.
  if(task)await db.query("UPDATE creator.tasks SET status='succeeded',started_at='2020-01-01'::timestamptz+$2::int*interval '1 second' WHERE id=$1",[task.id,++turn]);
  return task;
 }
 try{
  await t.test('continuous urgent news cannot starve either of the other two profiles',async()=>{
   await reset();for(const page of pages)for(let i=0;i<6;i++)await add(page,page===pages[0]?{input:{pipeline:{ruleId:'news'},urgent:true}}:{});
   const selected=[];for(let i=0;i<15;i++)selected.push((await take()).page_id);
   for(let i=0;i<15;i+=3)assert.deepEqual(new Set(selected.slice(i,i+3)),new Set(pages));
  });
  await t.test('future, running and uncertain tasks are never claimed; idle profiles waste no turns',async()=>{
   await reset();await add(pages[0],{at:'2999-01-01'});await add(pages[1],{status:'running'});await add(pages[1],{status:'unknown'});
   const id=await add(pages[2]);assert.equal((await take()).id,id);assert.equal(await take(),undefined);
  });
  await t.test('publishing and delayed receipts keep due-time order and priority',async()=>{
   await reset();await add(pages[0],{input:{urgent:true}});
   const receipt=await add(pages[1],{kind:'post_link_comment',at:'2000-01-01'}),publish=await add(pages[2],{kind:'publish',at:'2001-01-01'});
   await add(pages[0],{kind:'post_link_comment',at:'2999-01-01'});
   assert.equal((await take({})).id,receipt);assert.equal((await take({publishOnly:true})).id,publish);
   assert.equal(await take({publishOnly:true}),undefined);assert.equal((await take()).kind,'generate');
  });
  await t.test('a deferred claim consumes a turn; delivery does not',async()=>{
   await reset();const retry=await add(pages[0],{input:{urgent:true}});await take();
   await db.query("UPDATE creator.tasks SET status='queued' WHERE id=$1",[retry]);
   await add(pages[1],{kind:'publish',status:'succeeded',started:'2025-01-01'});
   const next=await add(pages[1]);assert.equal((await take()).id,next);assert.equal((await take()).id,retry);
  });
  await t.test('failed attempts and pipeline continuation stages share the same profile turn',async()=>{
   await reset();await add(pages[0],{status:'failed',started:'2025-01-01'});
   await add(pages[0],{kind:'creative',input:{urgent:true,pipeline:{}}});
   const article=await add(pages[1],{kind:'write_article'}),reel=await add(pages[2],{kind:'render_reel'});
   assert.equal((await take()).id,article);assert.equal((await take()).id,reel);assert.equal((await take()).kind,'creative');
  });
  await t.test('interrupted text recovery preserves its turn when started_at is cleared',async()=>{
   for(const kind of ['generate','write_article']){
    await reset();const recovered=await add(pages[0],{kind,input:{urgent:true}});
    assert.equal((await claimTask(db,{excludePublish:true})).id,recovered);
    // Match recoverExpiredTasks: reset the start/lease, retain the heartbeat.
    await db.query("UPDATE creator.tasks SET status='queued',not_before=now(),started_at=NULL,lease_until=NULL WHERE id=$1",[recovered]);
    const other=await add(pages[1]);assert.equal((await claimTask(db,{excludePublish:true})).id,other);
   }
  });
  await t.test('work without a profile has its own workspace bucket and cannot starve profiles',async()=>{
   await reset();const unscoped=await add(null,{kind:'test_connection',input:{urgent:true}});
   const profile=await add(pages[0]);assert.equal((await take()).id,unscoped);
   await add(null,{kind:'test_connection',input:{urgent:true}});assert.equal((await take()).id,profile);
  });
  await t.test('history is workspace scoped and survives a new claim caller',async()=>{
   await reset();await add(pages[0],{workspace:other,status:'succeeded',started:'2025-01-01'});
   const first=await add(pages[0],{input:{urgent:true}}),second=await add(pages[1]);
   assert.equal((await take()).id,first);
   assert.equal((await claimTask(db,{excludePublish:true})).id,second);
  });
  await t.test('urgent work still wins inside the selected profile; exact IDs remain constrained by due time/lane',async()=>{
   await reset();await add(pages[0]);const urgent=await add(pages[0],{input:{urgent:true},at:'2001-01-01'});
   assert.equal((await take()).id,urgent);
   const receipt=await add(pages[1],{kind:'publish'}),future=await add(pages[1],{kind:'publish',at:'2999-01-01'});
   assert.equal(await take({taskId:receipt,excludePublish:true}),undefined);
   assert.equal(await take({taskId:future}),undefined);assert.equal((await take({taskId:receipt})).id,receipt);
  });
 }finally{await db.close();}
});
