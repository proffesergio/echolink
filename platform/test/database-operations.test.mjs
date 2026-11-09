import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDatabaseSecret,databaseClientOptions,sealDatabaseSecret,safeDatabaseProfile,probeDatabase} from '../server/database-profiles.mjs';
import {instrumentDatabaseClient,databaseTelemetry} from '../server/database-telemetry.mjs';
test('database profiles encrypt secrets and remote TLS overrides cannot disable certificate verification',()=>{
 const prior=process.env.PLATFORM_ENCRYPTION_KEY;process.env.PLATFORM_ENCRYPTION_KEY='ab'.repeat(32);
 try{assert.throws(()=>parseDatabaseSecret('postgres://user:YOUR_PASSWORD@db.example/database'));
  const secret=parseDatabaseSecret('postgresql://admin:private-test-password@db.example/data?sslmode=no-verify&ssl=false&sslrootcert=bad&uselibpqcompat=true');const opts=databaseClientOptions(secret);
  assert.equal(opts.ssl.rejectUnauthorized,true);assert(!opts.connectionString.includes('ssl'));assert.equal(opts.max,2);
  const safe=safeDatabaseProfile({name:'Test',provider:'aiven',secret_cipher:sealDatabaseSecret(secret)});assert(!JSON.stringify(safe).includes('private-test-password'));assert.equal(safe.destination,'db.example/data');assert(safe.hasCredentials);
  assert.equal(databaseClientOptions(parseDatabaseSecret('postgres://u:p@127.0.0.1/data')).ssl,undefined);
  assert.throws(()=>databaseClientOptions(secret,{transport:'websocket'}));
 }finally{process.env.PLATFORM_ENCRYPTION_KEY=prior;}
});
test('database probes roll back their temporary write and expose safe quota failures',async()=>{
 const prior=process.env.PLATFORM_ENCRYPTION_KEY;process.env.PLATFORM_ENCRYPTION_KEY='cd'.repeat(32);const calls=[];
 class Client{on(){}async connect(){}async end(){}async query(sql){calls.push(sql);if(sql.includes('server_version'))return {rows:[{version:'18.6',bytes:'100',platform_schema:false}]};if(sql==='SELECT value FROM echolink_probe')return {rows:[{value:1}]};return {rows:[]};}}
 const profile={transport:'tcp',secret_cipher:sealDatabaseSecret(parseDatabaseSecret('postgres://u:private@db.example/app'))};
 try{const result=await probeDatabase(profile,{driverFor:()=>({Client})});assert(result.ok);assert.equal(calls.at(-1),'ROLLBACK');assert(result.verifiedTLS);
  class Failed extends Client{async connect(){throw Object.assign(new Error('quota with confidential connection details'),{code:'53000'});}}
  const failed=await probeDatabase(profile,{driverFor:()=>({Client:Failed})});assert(failed.quotaExceeded);assert(!JSON.stringify(failed).includes('confidential'));
 }finally{process.env.PLATFORM_ENCRYPTION_KEY=prior;}
});
test('traffic telemetry supports callback and promise clients without retaining SQL values or article text',async()=>{
 const client={query(sql,args,callback){const result={rows:[{body:'private-article-body',count:1}]};if(callback){callback(null,result);return 'callback-result';}return Promise.resolve(result);}};instrumentDatabaseClient(client);instrumentDatabaseClient(client);
 const sql='SELECT body FROM creator.posts WHERE title=$1';assert.equal((await client.query(sql,['private-query-value'])).rows.length,1);
 await new Promise((resolve,reject)=>assert.equal(client.query(sql,['private-query-value'],(e,result)=>{if(e)reject(e);else{assert.equal(result.rows.length,1);resolve();}}),'callback-result'));
 const metrics=databaseTelemetry();assert(metrics.totalCalls>=2);const serialized=JSON.stringify(metrics);for(const value of ['private-article-body','private-query-value','WHERE title'])assert(!serialized.includes(value));
 assert(metrics.queries.find(q=>q.label==='SELECT posts').estimatedResponseBytes>0);
});

import {queueDelay,queueLoop} from '../server/queue-loop.mjs';
test('idle queues back off, errors wait longer and each lane stays serial',async()=>{
 assert.equal(queueDelay({worked:true}),1500);assert.equal(queueDelay({idle:9}),15000);assert.equal(queueDelay({errors:1}),30000);assert.equal(queueDelay({errors:20}),120000);
 const scheduled=[];let count=0;const stop=queueLoop(async()=>{count++;return false;},{schedule:(fn,ms)=>{scheduled.push({fn,ms});return scheduled.length;},cancel:()=>{}});
 assert.equal(scheduled.length,1);await scheduled[0].fn();assert.equal(count,1);assert.equal(scheduled[1].ms,3000);stop();await scheduled[1].fn();assert.equal(scheduled.length,2);
});
