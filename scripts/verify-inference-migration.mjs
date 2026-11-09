import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import pg from 'pg';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
const project='gentle-dust-30064543',branch='dev-buffer-contact-'+Date.now();let created=false,client;
function cli(args){const entry=resolve(process.env.APPDATA||'','npm/node_modules/neon/dist/cli.js'),local=process.platform==='win32'&&existsSync(entry);const result=spawnSync(local?process.execPath:'neon',local?[entry,...args]:args,{encoding:'utf8',timeout:120000,windowsHide:true});if(result.status!==0)throw new Error('Neon '+args[0]+' failed (exit '+result.status+'). No credentials logged.');return result.stdout.trim();}
try{
 const parent=parseEnv(await readFile('platform/.env.local','utf8'));
 cli(['branches','create','--project-id',project,'--parent','echolink-platform-local','--name',branch,'--expires-at',new Date(Date.now()+86400000).toISOString(),'--no-secrets','--output','json']);created=true;
 const ownerURL=new URL(cli(['connection-string',branch,'--project-id',project,'--database-name','creator_local','--role-name','neondb_owner']));ownerURL.searchParams.set('sslmode','verify-full');const direct=ownerURL.href;
 if(ownerURL.hostname.includes('-pooler.'))throw new Error('Use a direct branch migration connection.');
 client=new pg.Client({connectionString:direct,connectionTimeoutMillis:20000});await client.connect();
 if(!(await client.query("SELECT 1 FROM creator.migrations WHERE name='013-inference-night-batches.sql'")).rowCount){await client.query(await readFile('platform/sql/013-inference-night-batches.sql','utf8'));console.log('Migration applied to disposable branch.');}else console.log('Disposable branch inherited the verified inference migration.');
 const runtime=new URL(parent.DATABASE_URL),host=ownerURL.hostname.split('.');if(runtime.hostname.includes('-pooler.'))host[0]+='-pooler';runtime.hostname=host.join('.');
 const result=spawnSync(process.execPath,['platform/scripts/check-inference-db.mjs'],{env:{...process.env,...parent,DATABASE_URL:runtime.href,DATABASE_URL_UNPOOLED:direct,ECHOLINK_BUFFER_TEST_BRANCH:branch,SMTP_HOST:''},encoding:'utf8',timeout:120000,windowsHide:true});
 if(result.stdout.trim())console.log(result.stdout.trim());if(result.status!==0){if(result.stderr)console.error(result.stderr.slice(-3000));throw new Error('Branch database checks failed.');}
}catch(error){console.error(error.message);process.exitCode=1;}
finally{await client?.end();if(created){try{cli(['branches','delete',branch,'--project-id',project]);console.log('Disposable verification branch removed.');}catch{console.error('Branch cleanup failed; its 24-hour expiry remains set.');process.exitCode=1;}}}
