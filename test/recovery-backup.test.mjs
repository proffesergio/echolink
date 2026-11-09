import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv,randomBytes} from 'node:crypto';
import {writeFile,mkdtemp,unlink,rmdir,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {verifyRecoveryArchive} from '../scripts/backup-recovery-materials.mjs';
test('encrypted recovery verification rejects wrong keys, corruption and incomplete files',async()=>{
 await mkdir('.codex',{recursive:true});
 const dir=await mkdtemp(resolve('.codex','recovery-archive-test-')),file=resolve(dir,'archive.enc'),keyFile=resolve(dir,'key'),signature=Buffer.from('ECHOLINK-RECOVERY-V1\n'),key=randomBytes(32),nonce=randomBytes(12),input=Buffer.from('private credentials and source media fixture');
 const cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(signature);const archive=Buffer.concat([signature,nonce,cipher.update(input),cipher.final(),cipher.getAuthTag()]);
 try{await writeFile(file,archive);await writeFile(keyFile,key.toString('base64'));const good=await verifyRecoveryArchive(file,keyFile);assert(good.authenticated);assert.equal(good.compressedPayloadBytes,input.length);
  await writeFile(keyFile,randomBytes(32).toString('base64'));await assert.rejects(verifyRecoveryArchive(file,keyFile));
  await writeFile(keyFile,key.toString('base64'));const corrupt=Buffer.from(archive);corrupt[signature.length+15]^=1;await writeFile(file,corrupt);await assert.rejects(verifyRecoveryArchive(file,keyFile));
  await writeFile(file,Buffer.from('unfinished'));await assert.rejects(verifyRecoveryArchive(file,keyFile));
 }finally{await unlink(file).catch(()=>{});await unlink(keyFile).catch(()=>{});await rmdir(dir);}
});
