import test from 'node:test';
import assert from 'node:assert/strict';
import {databaseSession} from '../server/database-deadline.mjs';
test('a hung website connection and hung cleanup cannot stall the publishing lane',async()=>{
 let query=false,destroyed=0,finishConnect;
 const db={connect:()=>new Promise(r=>{finishConnect=r;}),end:()=>new Promise(()=>{}),connection:{stream:{destroy:()=>destroyed++}}};
 await assert.rejects(()=>databaseSession(db,{},()=>{query=true;},{timeout:20,cleanupTimeout:10}),{code:'ETIMEDOUT'});
 finishConnect();await new Promise(r=>setTimeout(r,1));assert(!query);assert(destroyed>=1);
});
test('database work preserves its result or original rejection while bounding cleanup',async()=>{
 const db={connect:async()=>{},end:()=>new Promise(()=>{})};
 assert.equal(await databaseSession(db,{},async()=>42,{cleanupTimeout:5}),42);
 const error=Object.assign(Error('definite rejection'),{definiteRejection:true});
 await assert.rejects(()=>databaseSession(db,{},async()=>{throw error;},{cleanupTimeout:5}),e=>e===error);
});
