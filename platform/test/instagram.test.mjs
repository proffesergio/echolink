import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {publishPhotoFlow,discoverInstagram} from '../server/instagram.mjs';
import {signedMediaURL,validMediaSignature} from '../server/public-media.mjs';
test('signed JPEG URLs reject expiry, workspace changes and tampering',()=>{
 process.env.PLATFORM_ENCRYPTION_KEY||='test-signing-key-at-least-thirty-two-characters';process.env.PLATFORM_ORIGIN||='https://example.com';const w=randomUUID(),asset=randomUUID(),now=Date.now(),url=new URL(signedMediaURL(w,asset,{now})),expires=url.searchParams.get('expires'),signature=url.searchParams.get('signature');
 assert(validMediaSignature(w,asset,expires,signature,{now}));assert(!validMediaSignature(randomUUID(),asset,expires,signature,{now}));assert(!validMediaSignature(w,asset,expires,signature,{now:now+7200001}));assert(!validMediaSignature(w,asset,expires,'0'.repeat(64),{now}));
});
test('Instagram discovery only accepts the professional account linked to the selected Page',async()=>{
 const account=await discoverInstagram({fb_page_id:'123'},{config:{version:'v26.0'}},{token:'fixture'},async url=>url.includes('content_publishing_limit')?{data:[]}:{instagram_business_account:{id:'456',username:'fixture'}});assert.equal(account.id,'456');
 await assert.rejects(()=>discoverInstagram({fb_page_id:'123'},{config:{version:'v26.0'}},{token:'fixture'},async()=>({})),/professional Instagram/);
});
test('Instagram persists the container and publishing claim before publishing, then skips repeats',async()=>{
 const events=[],options={base:'https://graph.facebook.com/v26.0',accountId:'456',token:'fixture',imageURL:'https://example.com/signed-photo',caption:'A real product caption',delivery:{status:'queued'},onContainer:async()=>events.push('container-saved'),onPublishing:async()=>events.push('claimed'),onPublished:async()=>events.push('recorded'),request:async(url,request)=>{if(url.endsWith('/media'))return {id:'container'};if(url.includes('status_code'))return {status_code:'FINISHED'};assert(events.includes('container-saved'));assert(events.includes('claimed'));events.push('remote-publish');return {id:'media'};}};
 const result=await publishPhotoFlow(options);assert.equal(result.id,'media');assert.deepEqual(events,['container-saved','claimed','remote-publish','recorded']);assert.equal((await publishPhotoFlow({...options,delivery:{status:'published',remote_id:'media'},request:()=>{throw Error('No duplicate HTTP call');}})).alreadyPublished,true);
});
test('Instagram resumes processing containers but never retries a lost publication response',async()=>{
 const options={base:'https://graph.facebook.com/v26.0',accountId:'456',token:'fixture',imageURL:'https://example.com/photo',caption:'Caption',delivery:{status:'preparing',container_id:'saved'},onContainer:async()=>{throw Error('Must reuse container');},onPublishing:async()=>{},onPublished:async()=>{}};
 await assert.rejects(()=>publishPhotoFlow({...options,request:async()=>({status_code:'IN_PROGRESS'})}),e=>e.code==='instagram_processing');
 await assert.rejects(()=>publishPhotoFlow({...options,request:async url=>{if(url.includes('status_code'))return {status_code:'FINISHED'};throw Error('Lost response');}}),e=>e.code==='publication_unknown');
 await assert.rejects(()=>publishPhotoFlow({...options,delivery:{status:'unknown'},request:()=>{throw Error('Must not retry');}}),e=>e.code==='publication_unknown');
});
