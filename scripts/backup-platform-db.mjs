import {neonPgRelay} from './neon-pg-relay.mjs';
import * as tls from 'node:tls';
import '../platform/server/env.mjs';
import {spawn} from 'node:child_process';
import {mkdir,rename,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {parseEnv} from 'node:util';
import {readFile} from 'node:fs/promises';
import {postgresBin} from './postgres-tools.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),bin=postgresBin(),dir=resolve(root,'.codex/backups');
const selected=process.argv.find(a=>a.startsWith('--profile='))?.slice(10)||'primary';
if(selected!=='primary'){
 const saved=parseEnv(await readFile(resolve(root,'.env.local'),'utf8'));
 const key={aiven:'AIVEN_DATABASE_URL_UNPOOLED',local:'LOCAL_POSTGRES_DATABASE_URL_UNPOOLED',neon:'NEON_DATABASE_URL_UNPOOLED'}[selected];if(!key||!saved[key])throw new Error('Choose a configured primary, aiven, local or neon backup profile.');
 process.env.DATABASE_URL_UNPOOLED=saved[key];process.env.PLATFORM_DATABASE_TRANSPORT=selected==='neon'?(saved.NEON_DATABASE_TRANSPORT||'websocket'):'tcp';process.env.DATABASE_CA_CERT_BASE64=selected==='aiven'?saved.AIVEN_CA_CERT_BASE64:'';
}
let url;try{url=new URL(process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL);}catch{throw new Error('Configure the current primary database before exporting.');}
if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('A PostgreSQL source is required.');
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),file=resolve(dir,(url.pathname==='/creator_test'?'TEST-ONLY-creator-test-':'echolink-'+selected+'-')+stamp+'.dump');await mkdir(dir,{recursive:true});
const environment={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:['127.0.0.1','localhost'].includes(url.hostname)?'disable':'verify-full',PGCONNECT_TIMEOUT:'15'};
let relay;try{
 if(process.env.PLATFORM_DATABASE_TRANSPORT==='websocket'&&url.hostname.endsWith('.neon.tech')){relay=await neonPgRelay(url.hostname,url.port||'5432');environment.PGHOST='127.0.0.1';environment.PGPORT=String(relay.port);environment.PGSSLMODE='disable';environment.PGCHANNELBINDING='disable';}
 else if(!['127.0.0.1','localhost'].includes(url.hostname)){const ca=resolve(root,'.codex/postgres-root-ca.pem');await writeFile(ca,process.env.DATABASE_CA_CERT_BASE64?Buffer.from(process.env.DATABASE_CA_CERT_BASE64,'base64').toString():[...new Set([...tls.rootCertificates,...(tls.getCACertificates?.('system')||[])])].join('\n'));environment.PGSSLROOTCERT=ca;}
 await new Promise((resolveRun,reject)=>{const child=spawn(resolve(bin,'pg_dump'+(process.platform==='win32'?'.exe':'')),['--format=custom','--no-owner','--no-acl','--file',file+'.part'],{env:environment,windowsHide:true,stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',b=>stderr+=b);child.on('error',()=>reject(new Error('PostgreSQL export tools are not installed.')));child.on('exit',code=>code===0?resolveRun():reject(new Error(/quota/i.test(stderr)?'Neon still refuses export because its quota is exhausted. Restore source access or provide an existing dump.':'Database export failed. The partial file is not a usable backup.')));});
 await rename(file+'.part',file);await writeFile(file+'.json',JSON.stringify({createdAt:new Date().toISOString(),database:environment.PGDATABASE,sourceProfile:selected,standbyOnly:['echolink_standby','echolink_local'].includes(environment.PGDATABASE),format:'pg_dump custom',testOnly:environment.PGDATABASE==='creator_test',complete:true,containsEncryptedCredentials:true,restoreRequiresOriginalEncryptionKey:true},null,2));console.log('Complete private database export: '+file);
}catch(error){console.error(error.message);process.exitCode=1;}finally{await relay?.close();}
