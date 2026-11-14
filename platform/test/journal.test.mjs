import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createHash} from 'node:crypto';
import {journalSchema,journalHash,journalSourceHash,journalSignature,publishJournal} from '../server/journal.mjs';
const w='11111111-1111-4111-8111-111111111111',p='22222222-2222-4222-8222-222222222222',postId='33333333-3333-4333-8333-333333333333';
const fixture=()=>({version:'fabrything-journal-v1',sourceKey:[w,p,postId].join(':'),workspaceId:w,pageId:p,title:'Choose a compatible accessory',slug:'compatible-accessory',excerpt:'Check the manual before ordering.',seoTitle:'Accessory compatibility',seoDescription:'How to check a connector.',keyword:'compatible connector',problem:'Avoid an incompatible connector',audience:'Shoppers',intent:'buying_guide',clusterSlug:'accessories',tags:['accessories'],sources:[{title:'Manual',url:'https://example.com/manual'}],products:[],blocks:[{type:'heading',text:'Check the manual'},{type:'paragraph',text:'Read the supplied connector documentation before choosing an accessory.'},{type:'image',alt:'Connector dimensions in the manual',width:1200,height:675}],editorial:{reviewed:true},publish:true});
const secret='test-only-'.repeat(5),connection={config:{url:'https://www.fabrything.com'},secret:{apiKey:secret}},site={url:'https://www.fabrything.com'};
function post(payload=fixture()){return {id:postId,workspace_id:w,page_id:p,title:payload.title,seo:{article:{text:'Check the manual\n\nRead the supplied connector documentation before choosing an accessory.'},journal:{payload,reviewedHash:journalHash(payload),sourceHash:journalSourceHash({})}}};}

test('a lost website response is reconciled by a signed receipt without a second POST',async()=>{
 let posts=0,lookups=0;const prepared=post();
 const send=async(url,options)=>{
  if(options?.method==='POST'){posts++;throw Object.assign(new Error('Connection interrupted'),{status:502});}
  if(url.includes('sourceKey=')){lookups++;assert(options.headers['X-EchoLink-Signature']);return {ok:true,bytes:Buffer.from(JSON.stringify({id:8,url:'https://www.fabrything.com/blog/compatible-accessory',status:'PUBLISHED',sourceKey:fixture().sourceKey,payloadHash:createHash('sha256').update(JSON.stringify(journalSchema.parse(fixture()))).digest('hex')}))};}
  return {ok:true,bytes:Buffer.from('<article><h1>Choose a compatible accessory</h1><h2>Check the manual</h2><p>Read the supplied connector documentation before choosing an accessory.</p></article>')};
 };
 assert.equal((await publishJournal(connection,site,prepared,{send})).id,8);assert.equal(posts,1);assert.equal(lookups,1);
 prepared.website_url='https://www.fabrything.com/blog/compatible-accessory';await publishJournal(connection,site,prepared,{send});assert.equal(posts,1);
});
test('journal contract rejects private links, missing image plans and invented product references',()=>{
 assert(journalSchema.safeParse(fixture()).success);
 const invalid=fixture();invalid.sources[0].url='https://127.0.0.1/internal';assert(!journalSchema.safeParse(invalid).success);
 const noImage=fixture();noImage.blocks.pop();assert(!journalSchema.safeParse(noImage).success);
 const missingProduct=fixture();missingProduct.blocks.push({type:'products',productIds:['invented']});assert(!journalSchema.safeParse(missingProduct).success);
 const encoded=JSON.stringify(journalSchema.parse(fixture())),signed=journalSignature(encoded,secret,'1700000000');
 assert.equal(signed['X-EchoLink-Signature'],createHmac('sha256',secret).update('1700000000.'+encoded).digest('hex'));
});
test('tenant or reviewed-text changes stop delivery before any request',async()=>{
 const changed=post();changed.page_id=w;let calls=0;await assert.rejects(publishJournal(connection,site,changed,{send:async()=>{calls++;}}),e=>e.status===409);assert.equal(calls,0);
 const edited=post();edited.seo.article.text='changed';await assert.rejects(publishJournal(connection,site,edited),e=>e.status===409);
 const sourceEdit=post();sourceEdit.seo.journalBrief={problem:'Changed problem'};await assert.rejects(publishJournal(connection,site,sourceEdit),e=>e.status===409);
});
test('delivery requires the exact public canonical receipt and visible article; review is not publication',async()=>{
 let calls=0;const send=async(url,options)=>{calls++;if(options?.method==='POST'){assert(url.endsWith('/api/store/journal/publish/'));assert(options.headers['X-EchoLink-Signature']);return {ok:true,status:201,bytes:Buffer.from(JSON.stringify({id:8,url:'https://www.fabrything.com/blog/compatible-accessory',status:'PUBLISHED'}))};}return {ok:true,bytes:Buffer.from('<article><h1>Choose a compatible accessory</h1><h2>Check the manual</h2><p>Read the supplied connector documentation before choosing an accessory.</p></article>')};};
 const receipt=await publishJournal(connection,site,post(),{send});assert.equal(receipt.id,8);assert.equal(calls,2);
 await assert.rejects(publishJournal(connection,site,post(),{send:async()=>({ok:true,status:201,bytes:Buffer.from(JSON.stringify({id:8,url:'https://www.fabrything.com/blog/compatible-accessory',status:'REVIEW'}))})}),e=>e.code==='journal_awaiting_review'&&e.definiteRejection===true);
});
