import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createHash} from 'node:crypto';
import {journalSchema,journalHash,journalSourceHash,journalSignature,publishJournal,generateJournalArticle,journalDraftFromProse,journalProductScopeWarnings,journalProseWarnings,journalText} from '../server/journal.mjs';
const w='11111111-1111-4111-8111-111111111111',p='22222222-2222-4222-8222-222222222222',postId='33333333-3333-4333-8333-333333333333';
const fixture=()=>({version:'fabrything-journal-v1',sourceKey:[w,p,postId].join(':'),workspaceId:w,pageId:p,title:'Choose a compatible accessory',slug:'compatible-accessory',excerpt:'Check the manual before ordering.',seoTitle:'Accessory compatibility',seoDescription:'How to check a connector.',keyword:'compatible connector',problem:'Avoid an incompatible connector',audience:'Shoppers',intent:'buying_guide',clusterSlug:'accessories',tags:['accessories'],sources:[{title:'Manual',url:'https://example.com/manual'}],products:[],blocks:[{type:'heading',text:'Check the manual'},{type:'paragraph',text:'Read the supplied connector documentation before choosing an accessory.'},{type:'image',alt:'Connector dimensions in the manual',width:1200,height:675}],editorial:{reviewed:true},publish:true});
const secret='test-only-'.repeat(5),connection={config:{url:'https://www.fabrything.com'},secret:{apiKey:secret}},site={url:'https://www.fabrything.com'};
test('plain local prose becomes a structured guide without model-generated layout or links',()=>{
 const raw='Check the documented device requirements before buying an accessory.\n\nThe official documentation explains which settings indicate support.\n\nManufacturer qualifications and possible updates remain important when deciding.\n\nConfirm support with the manufacturer before purchasing.';
 const draft=journalDraftFromProse(raw,{keyword:'audio compatibility'});
 assert.equal(draft.blocks.filter(b=>b.type==='heading').length,2);assert.equal(draft.blocks.filter(b=>b.type==='paragraph').length,3);assert.equal(draft.blocks.at(-1).type,'verdict');assert.equal(draft.excerpt,raw.split('\n')[0]);assert.deepEqual(journalProseWarnings(draft.blocks),[]);
 assert.throws(()=>journalDraftFromProse('An incomplete one-paragraph answer.'),/three complete/);
});
test('general technology documentation cannot validate catalog-model compatibility claims',()=>{
 const products=[{title:'Lenovo HE05X Bluetooth Neckband Earphone'}],source='LE Audio support depends on implementation in both devices.';
 assert(journalProductScopeWarnings('The HE05X uses Classic Audio and cannot support LE Audio.',products,source).length);
 assert(journalProductScopeWarnings('Lenovo does not support this feature.',products,source).length);
 assert.deepEqual(journalProductScopeWarnings('Check manufacturer compatibility documentation before buying.',products,source),[]);
 assert.deepEqual(journalProductScopeWarnings('The HE05X is documented here.',products,'Official HE05X documentation.'),[]);
});
test('truncated sentences and serialized response fragments cannot pass reviewed delivery',async()=>{
 assert(journalProseWarnings([{type:'paragraph',text:'This sentence ends part-way through the'}]).length);
 assert(journalProseWarnings([{type:'paragraph',text:'A source claim.”} , { Next claim.'}]).length);
 assert.deepEqual(journalProseWarnings([{type:'heading',text:'Check support'},{type:'paragraph',text:'Support may depend on drivers.'},{type:'verdict',text:'Check the manufacturer’s documentation.'}]),[]);
 const payload=fixture();payload.blocks[1].text='This generated paragraph was cut mid-sentence';const prepared=post(payload);prepared.seo.article.text=journalText(payload.blocks);
 let requests=0;await assert.rejects(publishJournal(connection,site,prepared,{send:async()=>{requests++;}}),/complete sentence/);assert.equal(requests,0);
});
test('a model-approved payload still cannot submit unsupported catalog compatibility prose',async()=>{
 const payload=fixture();payload.products=[{id:'real-example',title:'Lenovo HE05X Bluetooth Neckband',platform:'fabrything',url:'https://example.com/product',sourceUrl:'https://example.com/product',imageAlt:'Catalog example',specs:{}}];payload.blocks.push({type:'paragraph',text:'The HE05X uses Classic Audio and cannot support LE Audio.'});
 const prepared=post(payload);prepared.body='General LE Audio documentation describes requirements for supported devices.';prepared.seo.article.text=journalText(payload.blocks);prepared.seo.journal.sourceHash=journalSourceHash(prepared);
 let requests=0;await assert.rejects(publishJournal(connection,site,prepared,{send:async()=>{requests++;}}),/model-specific source documentation/);assert.equal(requests,0);
});
function post(payload=fixture()){return {id:postId,workspace_id:w,page_id:p,title:payload.title,seo:{article:{text:'Check the manual\n\nRead the supplied connector documentation before choosing an accessory.'},journal:{payload,reviewedHash:journalHash(payload),sourceHash:journalSourceHash({})}}};}

test('structured writing checkpoints survive a review interruption without another writer call',async()=>{
 const page={id:p,language:'English',niche:'Audio',creative_policy:{journal:{enabled:true,clusterSlug:'accessories',audience:'Everyday shoppers'}}};
 const prepared={id:postId,workspace_id:w,title:'Choose a compatible accessory',body:'Manufacturer documentation describes compatibility requirements for the computer and accessory together. Supported settings depend on the implementation. Consult the relevant product specifications before choosing an upgrade; general technology support does not establish support for an individual product.',seo:{journalBrief:{sources:fixture().sources,products:[],images:[{type:'image',alt:'A supplied accessory illustration',src:'https://example.com/image.webp',width:1200,height:1200}]}}};
 prepared.body+=' The audio guidance separates a general standard from the features implemented by a manufacturer. An operating system setting can appear only when the appropriate hardware and software expose it. Manufacturer support pages describe supported configurations and known limitations. A retail listing is useful context for identifying the accessory but does not replace technical documentation. Investigate the available configuration before spending money on replacement equipment. Keep assumptions separate from the capabilities documented for the particular computer and connected accessory.';
 const draft={excerpt:'Check documented compatibility before choosing your next accessory.',blocks:[{type:'heading',text:'Start with device compatibility'},{type:'paragraph',text:'Compatibility is a property of the complete audio setup. Read the documentation for the computer and accessory together before deciding whether an upgrade addresses the problem. A feature listed for a technology family does not establish that every device implements it. General guidance cannot replace the specifications supplied for the particular equipment you own.'},{type:'heading',text:'Make a supported buying decision'},{type:'paragraph',text:'Check the available settings against the documented requirements. If a required option is missing, verify the device support rather than assuming a new accessory will add the capability. Store product examples illustrate the category; they are not evidence of a hands-on comparison or a promise about a specific combination. Keep the existing equipment until the actual requirements are clear.'}]};
 let checkpoint;const phases=[];
 await assert.rejects(generateJournalArticle({page,post:prepared,connection:{config:{}},secret:{}},{complete:async(_c,_s,_prompt,options)=>{if(options.purpose==='journal_article')assert.equal(options.responseSchema,undefined);if(options.purpose==='journal_review')throw new Error('Simulated review interruption');return JSON.stringify(draft);},onSection:async saved=>{checkpoint=structuredClone(saved);},onProgress:async(_a,_b,d)=>phases.push(d.stage)}),/Simulated review interruption/);
 assert(checkpoint);assert(phases.some(p=>p.includes('reviewing')));
 const calls=[];const result=await generateJournalArticle({page,post:prepared,connection:{config:{}},secret:{}},{savedDraft:checkpoint,complete:async(_c,_s,_prompt,o)=>{calls.push(o.purpose);return JSON.stringify({supported:true,contextComplete:true,issues:[]});}});
 assert.deepEqual(calls,['journal_review']);assert(result.journal?.reviewedHash);assert(result.journal.payload.blocks.some(b=>b.type==='image'&&b.src));
 const shaped={excerpt:draft.excerpt,lead:'Read the documentation before deciding whether a replacement accessory addresses the problem.',sections:[{heading:'**Check compatibility**',paragraph:draft.blocks[1].text},{heading:'Make a supported choice',paragraph:draft.blocks[3].text}],verdict:'Confirm the documented requirements before buying.'};
 const structured=await generateJournalArticle({page,post:prepared,connection:{config:{}},secret:{}},{complete:async(_c,_s,_prompt,o)=>JSON.stringify(o.purpose==='journal_article'?shaped:{supported:true,contextComplete:true,issues:[]})});
 assert(structured.journal?.reviewedHash);assert.equal(structured.journal.payload.blocks.filter(b=>b.type==='heading').length,2);assert.equal(structured.journal.payload.blocks.find(b=>b.type==='heading').text,'Check compatibility');
 const correctionCalls=[];let reviews=0;const corrected=await generateJournalArticle({page,post:prepared,connection:{config:{}},secret:{}},{savedDraft:checkpoint,complete:async(_c,_s,_prompt,o)=>{correctionCalls.push(o.purpose);return JSON.stringify(o.purpose==='journal_article'?draft:++reviews===1?{supported:false,contextComplete:true,issues:['A product claim needs correction']}:{supported:true,contextComplete:true,issues:[]});}});
 assert.deepEqual(correctionCalls,['journal_review','journal_article','journal_review']);assert(corrected.journal?.reviewedHash);
 const heldCalls=[];const held=await generateJournalArticle({page,post:prepared,connection:{config:{}},secret:{}},{savedDraft:checkpoint,complete:async(_c,_s,_prompt,o)=>{heldCalls.push(o.purpose);return JSON.stringify(o.purpose==='journal_article'?draft:{supported:false,contextComplete:false,issues:['Unresolved source limitation']});}});assert.equal(held.hold,true);assert.equal(heldCalls.filter(p=>p==='journal_article').length,1);
 await assert.rejects(generateJournalArticle({page,post:{...prepared,body:prepared.body+' Updated source fact.'},connection:{config:{}},secret:{}},{savedDraft:checkpoint,complete:async(_c,_s,_prompt,o)=>{assert.equal(o.purpose,'journal_article');throw new Error('Writer required after evidence changed');}}),/Writer required after evidence changed/);
 await assert.rejects(generateJournalArticle({page,post:prepared,connection:{config:{}},secret:{}},{complete:async()=>JSON.stringify({...draft,excerpt:'x'.repeat(301)})}),/Journal structure needs correction: excerpt/);
});

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
