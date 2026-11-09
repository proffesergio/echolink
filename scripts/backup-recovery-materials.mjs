// Private operator backup: no billing change, publishing or database mutation.
import {spawn} from 'node:child_process';
import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,writeFile,readFile,appendFile,rename,stat} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {Writable} from 'node:stream';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),signature=Buffer.from('ECHOLINK-RECOVERY-V1\n');
export async function verifyRecoveryArchive(file,keyFile){
 const {size}=await stat(file),headerLength=signature.length+12;
 if(size<headerLength+16)throw new Error('Recovery archive is incomplete.');
 const handle=await import('node:fs/promises').then(fs=>fs.open(file,'r'));let header,tag;
 try{header=Buffer.alloc(headerLength);tag=Buffer.alloc(16);await handle.read(header,0,header.length,0);await handle.read(tag,0,tag.length,size-tag.length);}finally{await handle.close();}
 if(!header.subarray(0,signature.length).equals(signature))throw new Error('Unsupported recovery archive.');
 const key=Buffer.from((await readFile(keyFile,'utf8')).trim(),'base64');if(key.length!==32)throw new Error('The recovery key must contain 32 bytes.');
 const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(signature.length));decipher.setAAD(signature);decipher.setAuthTag(tag);
 let bytes=0;const digest=createHash('sha256');await pipeline(createReadStream(file,{start:headerLength,end:size-17}),decipher,new Writable({write(chunk,encoding,done){bytes+=chunk.length;digest.update(chunk);done();}}));
 return {authenticated:true,compressedPayloadBytes:bytes,payloadSHA256:digest.digest('hex')};
}
export async function backupRecoveryMaterials(){
 const stamp=new Date().toISOString().replace(/[:.]/g,'-'),directory=resolve(root,'.codex/backups'),keyDir=resolve(root,'.codex/secrets');await mkdir(directory,{recursive:true});await mkdir(keyDir,{recursive:true});
 const archive=resolve(directory,'echolink-local-materials-'+stamp+'.enc'),keyFile=resolve(keyDir,'echolink-recovery-'+stamp+'.key'),manifestFile=resolve(directory,'recovery-materials-'+stamp+'.json');
 const entries=['.env.local','platform/.env.local','platform/.env.postgres.local','platform/.local/assets','ca.pem'];for(const entry of entries)await stat(resolve(root,entry));
 const manifest={createdAt:new Date().toISOString(),kind:'encrypted local recovery materials',productionDatabaseIncluded:false,completeProductionRecovery:false,includesEnvironmentSecrets:true,includesLocalMedia:true,sourceProject:'gentle-dust-30064543',activeBranch:'echolink-platform-local',activeDatabase:'creator_local',holdBranch:'echolink-recovery-hold-20261109',holdBranchId:'br-silent-sea-azys4s3x',sqlExportStatus:'blocked by Neon quota',entries};
 await writeFile(manifestFile,JSON.stringify(manifest,null,2),{mode:0o600,flag:'wx'});entries.push(relative(root,manifestFile));
 const key=randomBytes(32),nonce=randomBytes(12);await writeFile(keyFile,key.toString('base64')+'\n',{mode:0o600,flag:'wx'});await writeFile(archive+'.part',Buffer.concat([signature,nonce]),{mode:0o600,flag:'wx'});
 const tar=spawn(process.platform==='win32'?'tar.exe':'tar',['-czf','-','-C',root,...entries],{windowsHide:true,stdio:['ignore','pipe','pipe']});let stderr='';tar.stderr.on('data',chunk=>{stderr+=chunk;});
 const exited=new Promise((resolveExit,reject)=>{tar.on('error',()=>reject(new Error('Archive tool is unavailable.')));tar.on('exit',code=>code===0?resolveExit():reject(new Error('Archive creation failed. No complete backup was marked.')));});
 try{const cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(signature);await Promise.all([pipeline(tar.stdout,cipher,createWriteStream(archive+'.part',{flags:'a'})),exited]);await appendFile(archive+'.part',cipher.getAuthTag());await rename(archive+'.part',archive);
  const verified=await verifyRecoveryArchive(archive,keyFile);const report={...manifest,archive:relative(root,archive),keyFile:relative(root,keyFile),archiveBytes:(await stat(archive)).size,verification:verified};await writeFile(manifestFile,JSON.stringify(report,null,2),{mode:0o600});return report;
 }finally{tar.kill();}
}
export async function unpackRecoveryArchive(file,keyFile){
 // Authenticate before extraction. Always extract into a new private folder;
 // recovery never overwrites the currently configured environment or assets.
 await verifyRecoveryArchive(file,keyFile);
 const folder=resolve(root,'.codex/recovery-unpack-'+Date.now());await mkdir(folder,{mode:0o700});const payload=resolve(folder,'payload.tar.gz');
 const size=(await stat(file)).size,header=Buffer.alloc(signature.length+12),key=Buffer.from((await readFile(keyFile,'utf8')).trim(),'base64');
 const handle=await import('node:fs/promises').then(fs=>fs.open(file,'r')),tag=Buffer.alloc(16);try{await handle.read(header,0,header.length,0);await handle.read(tag,0,16,size-16);}finally{await handle.close();}
 const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(signature.length));decipher.setAAD(signature);decipher.setAuthTag(tag);
 await pipeline(createReadStream(file,{start:signature.length+12,end:size-17}),decipher,createWriteStream(payload,{flags:'wx',mode:0o600}));
 await new Promise((done,reject)=>{const tar=spawn(process.platform==='win32'?'tar.exe':'tar',['-xzf',payload,'-C',folder,'-k'],{windowsHide:true,stdio:'ignore'});tar.on('error',reject);tar.on('exit',code=>code===0?done():reject(new Error('Archive extraction failed in the private recovery folder.')));});
 return {authenticated:true,folder:relative(root,folder),activeEnvironmentChanged:false,productionDatabaseIncluded:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=process.argv[2]==='verify'?await verifyRecoveryArchive(resolve(process.argv[3]),resolve(process.argv[4])):process.argv[2]==='unpack'?await unpackRecoveryArchive(resolve(process.argv[3]),resolve(process.argv[4])):await backupRecoveryMaterials();console.log(JSON.stringify(result));}catch(error){console.error('Recovery materials backup failed:',error.code||error.message);process.exitCode=1;}
}
