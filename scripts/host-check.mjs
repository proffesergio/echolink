import '../platform/server/env.mjs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {cpus,freemem,totalmem} from 'node:os';
import {inferenceHost} from '../platform/server/inference-host.mjs';
import {inferenceSettings} from '../platform/server/inference-resources.mjs';
import {transaction,closeDatabase} from '../platform/server/db.mjs';
import {postgresExecutable} from './postgres-tools.mjs';
const binary=(command,args)=>{try{return spawnSync(command,args,{encoding:'utf8',timeout:10000,windowsHide:true}).status===0;}catch{return false;}};
const report={node:process.versions.node,os:process.platform,cpu:cpus()[0]?.model,threads:cpus().length,totalGiB:+(totalmem()/1024**3).toFixed(1),freeGiB:+(freemem()/1024**3).toFixed(1),profile:inferenceSettings().name,inferenceTimeoutSeconds:inferenceSettings().timeoutSeconds,publishingEnabled:process.env.PLATFORM_PUBLISHING_ENABLED==='true',queueEnabled:process.env.PLATFORM_WORKER_ENABLED!=='false',credentials:{google:!!(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET),encryptionKey:!!process.env.PLATFORM_ENCRYPTION_KEY,workerToken:!!process.env.PLATFORM_WORKER_TOKEN},tools:{ffmpeg:binary(process.env.PLATFORM_FFMPEG_PATH||'ffmpeg',['-version']),ffprobe:binary(process.env.PLATFORM_FFPROBE_PATH||'ffprobe',['-version']),cloudflared:binary(process.env.PLATFORM_CLOUDFLARED_PATH||(process.platform==='win32'?fileURLToPath(new URL('../.codex/tools/cloudflared.exe',import.meta.url)):'cloudflared'),['--version'])}};
try{report.tools.postgres= binary(postgresExecutable('pg_dump'),['--version']);}catch{report.tools.postgres=false;}
try{const host=inferenceHost(),r=await fetch(host.url+'/api/tags',{signal:AbortSignal.timeout(10000)});const data=await r.json();report.ollama={reachable:r.ok,models:data.models?.map(m=>m.name)||[]};}catch{report.ollama={reachable:false};}
try{report.database=await transaction(null,async db=>{const role=(await db.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];const migrations=(await db.query('SELECT count(*)::int AS n FROM creator.migrations')).rows[0].n;return {reachable:true,migrations,...role};});}catch{report.database={reachable:false};}finally{await closeDatabase();}
console.log(JSON.stringify(report,null,2));if(!report.database.reachable||!report.ollama.reachable||report.database.rolsuper||report.database.rolbypassrls)process.exitCode=1;
