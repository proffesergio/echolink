import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import pg from 'pg';
import IORedis from '../platform/node_modules/ioredis/built/index.js';
import {parseDatabaseSecret,databaseClientOptions} from '../platform/server/database-profiles.mjs';
const settings={...process.env,...parseEnv(await readFile(new URL('../.env.local',import.meta.url),'utf8'))};
if(settings.SUPABASE_DATABASE_URL){
 const c=new pg.Client(databaseClientOptions(parseDatabaseSecret(settings.SUPABASE_DATABASE_URL,settings.SUPABASE_CA_CERT_BASE64?Buffer.from(settings.SUPABASE_CA_CERT_BASE64,'base64').toString():''),{transport:'tcp',max:1}));
 try{await c.connect();await c.query('SELECT 1');console.log('Supabase TCP/TLS connection: passed. Active DATABASE_URL was not changed.');}catch{console.error('Supabase connection failed. Check its URI, password, network access and CA.');process.exitCode=1;}finally{await c.end().catch(()=>{});}
}else console.log('Supabase: not configured. Local PostgreSQL remains active.');
if(settings.REDIS_URL){
 const redis=new IORedis(settings.REDIS_URL,{lazyConnect:true,connectTimeout:8000,maxRetriesPerRequest:1,retryStrategy:()=>null,enableOfflineQueue:false});redis.on('error',()=>{});
 try{await redis.connect();if(await redis.ping()!=='PONG')throw new Error();console.log('Redis PING: passed. Queue backend was not changed.');}catch{console.error('Redis connection failed. Check its URL, TLS and network access.');process.exitCode=1;}finally{redis.disconnect();}
}else console.log('Redis: not configured. Postgres task dispatch remains active.');
