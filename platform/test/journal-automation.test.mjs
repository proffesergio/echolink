import test from 'node:test';
import assert from 'node:assert/strict';
import {journalTopicKey,prepareJournalResearch,trustedJournalURL,relevantJournalTopic,journalPassages} from '../server/journal-research.mjs';
import {websiteConfigurationProblem,automaticDestination} from '../shared/destinations.mjs';
import {websitePublicationFailure,publishWebsiteArticle} from '../server/website-publication.mjs';
import {journalSlug} from '../server/journal.mjs';
import {readFabrythingCatalog} from '../server/fabrything.mjs';
import {normalizeProduct} from '../server/catalog.mjs';
import {readFile,readdir} from 'node:fs/promises';
import {queuePublication} from '../server/planner.mjs';

const source={title:'Audio compatibility documentation',url:'https://www.example.com/audio'};
const topic={key:'compatibility',title:'Choosing compatible Bluetooth headphones',keyword:'Bluetooth headphones compatibility',problem:'Check compatibility before ordering',intent:'buying_guide',sources:[source,{...source,url:'https://www.example.com/manual'}]};
const plan={automation:{trustedHosts:['example.com'],topics:[topic]}};
const product={external_id:'real-store-id',title:'Bluetooth Headphones',available:true,url:'https://www.fabrything.com/product/headphones',image_url:'https://www.fabrything.com/image.webp',attributes:{specifications:{Connector:'Bluetooth',Price:'forbidden'}}};
const readSource=async s=>({...s,paragraphs:Array.from({length:5},(_,i)=>'Bluetooth headphones compatibility depends on the supported audio profiles and both devices. Check the manufacturer documentation before choosing an accessory. Features are not supported on every device. This is source paragraph '+i+'.')});

test('the global publishing stop also blocks website delivery before database or network access',async()=>{
 const prior=process.env.PLATFORM_PUBLISHING_ENABLED;process.env.PLATFORM_PUBLISHING_ENABLED='false';
 try{await assert.rejects(publishWebsiteArticle({}),/Live publishing is disabled/);}finally{if(prior===undefined)delete process.env.PLATFORM_PUBLISHING_ENABLED;else process.env.PLATFORM_PUBLISHING_ENABLED=prior;}
});

test('automatic website destinations require an actual journal configuration, not Facebook verification',()=>{
 const page={destination_type:'website',kind:'blog',website_publishing:true,website_id:'site',creative_policy:{journal:{enabled:true}}};
 assert.equal(automaticDestination(page),true);assert.equal(websiteConfigurationProblem(page),null);
 assert(websiteConfigurationProblem({...page,fb_verified:true}));assert(websiteConfigurationProblem({...page,facebook_connection_id:'token'}));
 assert.equal(automaticDestination({...page,website_publishing:false}),false);
 assert.equal(automaticDestination({destination_type:'facebook_page',fb_verified:false}),false);
});
test('research stays in the chosen topical domain, keeps limitations and never invents affiliate destinations',async()=>{
 assert.throws(()=>trustedJournalURL('https://127.0.0.1/private',['127.0.0.1']));
 assert.throws(()=>trustedJournalURL('https://example.com.evil.invalid/audio',['example.com']));
 assert.equal(relevantJournalTopic('Bluetooth headphones for calls'),true);
 assert.equal(relevantJournalTopic('Bluetooth hearing aid medical treatment'),false);
 assert.equal(relevantJournalTopic('Bluetooth throughput for connected health'),false);
 await assert.rejects(prepareJournalResearch({plan:{automation:{...plan.automation,topics:[{...topic,sources:[source,source]}]}},products:[product]},{readSource}),/at least two/);
 const result=await prepareJournalResearch({plan,products:[product,{...product,title:'Prescription medicine'}]},{readSource});
 assert.equal(result.brief.products.length,1);assert.equal(result.brief.products[0].url,product.url);assert(!('Price' in result.brief.products[0].specs));
 assert(result.body.includes('not supported on every device'));assert(result.body.length<=4800);assert.equal(result.brief.intent,'buying_guide');assert.equal(result.research.sourceCount,2);
 assert.equal(await prepareJournalResearch({plan,products:[product],usedKeys:[result.key]},{readSource}),null);
 await assert.rejects(prepareJournalResearch({plan,products:[]},{readSource}),/relevant catalog image/);
});
test('source keys are stable and approved feed discovery does not recycle an existing story',async()=>{
 assert.equal(journalTopicKey(topic),journalTopicKey({...topic,title:'Changed display title'}));
 const feedPlan={automation:{trustedHosts:['example.com'],feedUrls:['https://www.example.com/feed'],referenceSources:[source]}};
 const entry={url:'https://www.example.com/new-audio',title:'Bluetooth headphones compatibility'};
 const result=await prepareJournalResearch({plan:feedPlan,products:[product]},{readSource,feed:async()=>[entry]});
 assert(result);assert.equal(await prepareJournalResearch({plan:feedPlan,products:[product],usedKeys:[result.key]},{readSource,feed:async()=>[entry]}),null);
 const text=journalPassages({paragraphs:['Relevant Bluetooth headphones are not compatible with all devices.','Another passage explains Bluetooth audio compatibility in the supplied manual.']},topic,200);
 assert(text.includes('not compatible'));assert(text.indexOf('Relevant')<text.indexOf('Another'));
});
test('confirmed or ambiguous website delivery can never silently become a fresh publication',()=>{
 assert.equal(websitePublicationFailure(new Error(),{submitted:true}).unknown,true);
 assert.equal(websitePublicationFailure({definiteRejection:true,status:422,message:'Rejected'},{submitted:true}).unknown,false);
 assert.equal(websitePublicationFailure({definiteRejection:true},{confirmed:true}).unknown,true);
 assert.match(journalSlug('Bluetooth: Audio & Compatibility','12345678-1234-4234-8234-123456789abc'),/^bluetooth-audio-compatibility-123456781234$/);
});
test('read-only catalog import retains real categories and specifications',async()=>{
 let sql;const database=async(c,s,fn)=>fn({query:async(q,args)=>{if(q.startsWith('SELECT')){sql=q;assert.deepEqual(args[2],['gadgets']);return {rows:[{id:1,name:'Bluetooth Headphones',slug:'headphones',image:[],description:'Supplied description',category:'Gadgets',brand:'Example',specifications:{Connector:'Bluetooth'},stock:1}]};}return {rows:[]};}},{schema:'public'});
 const site={url:'https://www.fabrything.com'};
 const raw=await readFabrythingCatalog({}, {},site,{categorySlugs:['gadgets']},{database});assert(sql.includes('category_id_id'));
 const normalized=normalizeProduct(raw[0],site);assert.equal(normalized.attributes.category,'Gadgets');assert.equal(normalized.attributes.specifications.Connector,'Bluetooth');
});

test('website-only scheduling uses real bridge readiness and preserves unknown receipts in disposable PostgreSQL',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE),db=new PGlite();
 try{
  await db.exec('CREATE ROLE creator_runtime; CREATE ROLE creator_relay;');
  for(const file of (await readdir(new URL('../sql/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL('../sql/'+file,import.meta.url),'utf8'));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM creator.migrations')).rows[0].n,22);
  const a=(await db.query("INSERT INTO creator.accounts(auth_subject,email,name) VALUES('website-test','website@example.invalid','Isolated') RETURNING id")).rows[0].id;
  const w=(await db.query("INSERT INTO creator.workspaces(name,owner_id) VALUES('Isolated website fixture',$1) RETURNING id",[a])).rows[0].id;
  await db.query("INSERT INTO creator.subscriptions(workspace_id,plan_id,status,period_end) SELECT $1,id,'active',now()+interval '30 days' FROM creator.plans ORDER BY page_limit DESC LIMIT 1 ON CONFLICT(workspace_id) DO UPDATE SET status='active',period_end=now()+interval '30 days'",[w]);
  const c=(await db.query("INSERT INTO creator.connections(workspace_id,provider,name,status) VALUES($1,'fabrything_blog','Isolated bridge','connected') RETURNING id",[w])).rows[0].id;
  const site=(await db.query("INSERT INTO creator.websites(workspace_id,name,url,kind,connector,connection_id) VALUES($1,'Isolated journal','https://example.invalid','blog','fabrything_blog',$2) RETURNING id",[w,c])).rows[0].id;
  const page=(await db.query("INSERT INTO creator.pages(workspace_id,name,niche,kind,destination_type,website_id,website_publishing,active,require_review,window_start,window_end,creative_policy,profile_config) VALUES($1,'Isolated blog','Audio','blog','website',$2,true,true,false,'00:00','00:00',$3,$4) RETURNING *",[w,site,JSON.stringify({journal:{enabled:true}}),JSON.stringify({content_workflow:'TEXT'})])).rows[0];
  assert.equal(page.fb_verified,false);
  const post=(await db.query("INSERT INTO creator.posts(workspace_id,page_id,type,title,caption,seo,creative) VALUES($1,$2,'blog','Isolated reviewed guide','A checked compatibility guide.',$3,'{}') RETURNING *",[w,page.id,JSON.stringify({journal:{reviewedHash:'isolated-reviewed-hash'},article:{text:'Isolated checked guide'},editorialWarnings:[]})])).rows[0];
  await db.query("UPDATE creator.connections SET status='error' WHERE id=$1",[c]);
  await assert.rejects(queuePublication(db,w,null,page,post,{at:new Date(Date.now()+120000),approveCurrent:true}),/Test the journal/);
  await db.query("UPDATE creator.connections SET status='connected' WHERE id=$1",[c]);
  const task=await queuePublication(db,w,null,page,post,{at:new Date(Date.now()+120000),approveCurrent:true});assert.equal(task.kind,'publish');assert.equal(task.input.websitePublishing,true);
  assert.equal((await db.query('SELECT status FROM creator.posts WHERE id=$1',[post.id])).rows[0].status,'scheduled');
  await db.query("UPDATE creator.posts SET status='unknown',website_url='https://example.invalid/blog/existing' WHERE id=$1",[post.id]);
  await db.query("UPDATE creator.usage_reservations SET status='unknown' WHERE post_id=$1",[post.id]);
  const uncertain=(await db.query('SELECT * FROM creator.posts WHERE id=$1',[post.id])).rows[0];
  await assert.rejects(queuePublication(db,w,null,page,uncertain,{autoPick:true}),/Restore or reconcile/);
  assert.equal((await db.query('SELECT status FROM creator.usage_reservations WHERE post_id=$1',[post.id])).rows[0].status,'unknown');
 }finally{await db.close();}
});
