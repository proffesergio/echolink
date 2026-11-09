import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {backupRecoveryMaterials} from './backup-recovery-materials.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
const run=(file,args=[])=>new Promise((done,reject)=>{const child=spawn(process.execPath,[file,...args],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);child.on('exit',code=>code===0?done(output):reject(new Error('Backup step failed: '+file)));});
try{const app=parseEnv(await readFile('platform/.env.local','utf8'));if(new URL(app.DATABASE_URL).hostname!=='127.0.0.1'||new URL(app.DATABASE_URL).pathname!=='/echolink_live')throw new Error('Nightly backup requires the configured fresh local primary.');
 const output=await run('scripts/backup-platform-db.mjs'),dump=output.match(/Complete private database export: ([^\r\n]+)/)?.[1];if(!dump)throw new Error('No completed database archive was reported.');
 let cloudBackupVerified=false;try{await run('scripts/sync-aiven-backup.mjs',[dump]);cloudBackupVerified=true;}catch{console.error('Cloud snapshot unavailable. The completed local backup is retained.');}
 const materials=await backupRecoveryMaterials(),report={createdAt:new Date().toISOString(),sourceDatabase:'echolink_live',databaseDump:dump,cloudBackupVerified,encryptedMaterials:materials.archive,keyFile:materials.keyFile,authenticated:materials.verification.authenticated,archivedNeonHistoryIncluded:false};
 await mkdir('.codex/logs',{recursive:true});await writeFile('.codex/logs/latest-backup.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
}catch(error){console.error(error.message);process.exitCode=1;}
