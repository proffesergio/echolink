import '../server/env.mjs';
import {readFile,readdir} from 'node:fs/promises';
import {databaseDriver} from '../server/database-driver.mjs';
if(!process.env.PLATFORM_BRANCH||process.env.PLATFORM_BRANCH==='production')throw new Error('Use the isolated platform development environment for migrations.');
const driver=databaseDriver(),client=new driver.Client({connectionString:process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL});
try{await client.connect();await client.query('CREATE SCHEMA IF NOT EXISTS creator');await client.query('CREATE TABLE IF NOT EXISTS creator.migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
 for(const file of (await readdir(new URL('../sql/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort()){
  if((await client.query('SELECT 1 FROM creator.migrations WHERE name=$1',[file])).rowCount)continue;
  await client.query(await readFile(new URL('../sql/'+file,import.meta.url),'utf8'));console.log('Applied platform migration '+file);
 }
}catch(error){console.error('Platform migration failed:',error.code||'database/setup');process.exitCode=1;}finally{await client.end();}
