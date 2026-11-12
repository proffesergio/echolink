import {createServer} from 'node:http';
import {createLocalInferenceGate,localInferenceGate} from '../server/inference-resources.mjs';
import {verifyExpandedOperations} from './operations-db-check.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile,unlink} from 'node:fs/promises';
import '../server/env.mjs';
import {createApp} from '../server/index.mjs';
import {query,transaction,closeDatabase} from '../server/db.mjs';
import {reservePublication} from '../server/quotas.mjs';
import {requireOwner,provisionAccount} from '../server/auth.mjs';
import {tickAutomations,continuePipeline,resumePreparedPosts,runOne,recoverExpiredTasks} from '../server/jobs.mjs';
import {pauseFacebookPage} from '../server/facebook.mjs';
import sharp from 'sharp';
import {saveAsset} from '../server/creative.mjs';
import {signedMediaURL} from '../server/public-media.mjs';
import {encryptSecret} from '../server/vault.mjs';
if(process.env.PLATFORM_BRANCH!=='echolink-platform-local'||new URL(process.env.DATABASE_URL).pathname!=='/creator_test')throw new Error('Integration tests require the isolated development branch.');
const original={port:process.env.PLATFORM_PORT,origin:process.env.PLATFORM_ORIGIN,owner:process.env.PLATFORM_OWNER_EMAIL};
process.env.SMTP_HOST='';process.env.PLATFORM_ENV='development'; // Fixtures never use production cookies or send external email.
process.env.PLATFORM_PORT='8792';process.env.PLATFORM_ORIGIN='http://localhost:8792';const origin=process.env.PLATFORM_ORIGIN;
const suffix=randomUUID(),ownerEmail='owner-'+suffix+'@example.com';process.env.PLATFORM_OWNER_EMAIL=ownerEmail;
const server=createApp(),accounts=[],mailFiles=[];
const pwd='Local-test-only-'+randomUUID();
async function call(path,{method='GET',body,cookie,workspace,withOrigin=true}={}){
 const r=await fetch(origin+path,{method,headers:{...(withOrigin?{origin}:{}),...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...(workspace?{'x-workspace-id':workspace}:{})},body:body?JSON.stringify(body):undefined,redirect:'manual'});let data;try{data=await r.json();}catch{data={};}return {status:r.status,data,cookie:r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ')};
}
async function signup(name,email){
 const r=await call('/api/auth/sign-up/email',{method:'POST',body:{name,email,password:pwd}});assert.equal(r.status,200,'signup');
 const dir=new URL('../.local/mail/',import.meta.url);let mail,file;
 for(const name of await readdir(dir)){const value=JSON.parse(await readFile(new URL(name,dir),'utf8'));if(value.to===email){mail=value;file=new URL(name,dir);break;}}
 assert(mail,'private verification message exists');mailFiles.push(file);
 const verify=await fetch(mail.url,{redirect:'manual'});assert([200,302].includes(verify.status),'email verification');
 const login=await call('/api/auth/sign-in/email',{method:'POST',body:{email,password:pwd}});assert.equal(login.status,200,'sign in');assert(login.cookie,'session cookie exists');
 const state=await call('/api/state',{cookie:login.cookie});assert.equal(state.status,200,JSON.stringify(state.data));accounts.push({email,id:state.data.actor.id,w:state.data.workspace.id,subject:r.data.user.id});return {...state.data,cookie:login.cookie};
}
test('real accounts, tenant isolation, concurrent quotas, approvals and owner billing',async t=>{
 await new Promise(resolve=>server.listen(8792,'127.0.0.1',resolve));
 let a,b,o;
 try{
  await t.test('anonymous state is rejected; signup, verification and sessions work',async()=>{
   const reserved=await transaction(null,async db=>{const account=(await db.query("INSERT INTO creator.accounts(auth_subject,email,name,role,email_verified) VALUES($1,$2,'Reserved test owner','super_admin',false) RETURNING *",['bootstrap-owner:'+randomUUID(),ownerEmail])).rows[0];const ws=(await db.query("INSERT INTO creator.workspaces(name,owner_id) VALUES('Reserved owner workspace',$1) RETURNING id",[account.id])).rows[0];await db.query("INSERT INTO creator.memberships(workspace_id,account_id,role) VALUES($1,$2,'owner')",[ws.id,account.id]);await db.query("INSERT INTO creator.subscriptions(workspace_id,plan_id) VALUES($1,'free')",[ws.id]);return {accountId:account.id,workspaceId:ws.id};},{owner:true});
   await assert.rejects(provisionAccount({id:randomUUID(),email:ownerEmail,name:'Unverified impostor',email_verified:false}),{code:'23505'});
   assert.equal((await call('/api/state')).status,401);a=await signup('Alpha creator','alpha-'+suffix+'@example.com');b=await signup('Beta creator','beta-'+suffix+'@example.com');o=await signup('Test platform owner',ownerEmail);assert.notEqual(a.workspace.id,b.workspace.id);assert.equal(a.actor.role,'admin');assert.equal(o.actor.role,'super_admin');assert.equal(o.actor.id,reserved.accountId);assert.equal(o.workspace.id,reserved.workspaceId);
  });
  if(!a||!b||!o)throw new Error('Account setup failed.');
  await t.test('infrastructure monitoring rejects anonymous and tenant sessions',async()=>{
   assert.equal((await call('/api/owner/operations')).status,401);
   assert.equal((await call('/api/owner/operations',{cookie:a.cookie})).status,403);
   const live=await call('/api/owner/operations',{cookie:o.cookie});assert.equal(live.status,200);assert.equal(live.data.capacity.loadBalancingEnabled,false);assert.equal(live.data.inference.concurrency,1);assert(Array.isArray(live.data.metrics.series));assert(live.data.services.some(s=>s.name==='Primary database'&&s.status==='healthy'));
   const encoded=JSON.stringify(live.data);assert(!encoded.includes('connectionString'));assert(!encoded.includes('secret_cipher'));assert(!encoded.includes('DATABASE_URL='));
   assert.equal((await call('/internal/platform/operations')).status,401);
  });
  let pageA,pageB,connectionA,postA;
  await t.test('Page cap is atomic and workspace IDs cannot be selected across accounts',async()=>{
   const data={name:'Alpha Page',niche:'Education',kind:'education',language:'English'};
   const results=await Promise.all([call('/api/pages',{method:'POST',body:data,cookie:a.cookie}),call('/api/pages',{method:'POST',body:{...data,name:'Extra Page'},cookie:a.cookie})]);assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.status===402).length,1);pageA=results.find(r=>r.status===200).data;
   pageB=(await call('/api/pages',{method:'POST',body:{...data,name:'Beta Page'},cookie:b.cookie})).data;
   assert.equal((await call('/api/state',{cookie:b.cookie,workspace:a.workspace.id})).status,403);
   assert.equal((await call('/api/pages/'+pageA.id,{method:'PUT',body:data,cookie:b.cookie})).status,404);
   assert.equal((await call('/api/pages',{method:'POST',body:data,cookie:a.cookie,withOrigin:false})).status,403);
  });
  await t.test('encrypted connections are not disclosed or linkable from another tenant',async()=>{
   connectionA=(await call('/api/connections',{method:'POST',cookie:a.cookie,body:{name:'Private AI',provider:'openai',config:{model:'configured-model'},secret:{apiKey:'not-a-real-test-key'}}})).data;
   const state=await call('/api/state',{cookie:a.cookie});const c=state.data.connections.find(c=>c.id===connectionA.id);assert(c.has_secret);assert.equal(c.secret_cipher,undefined);assert(!JSON.stringify(state.data).includes('not-a-real-test-key'));
   const foreign=await call('/api/pages/'+pageB.id,{method:'PUT',cookie:b.cookie,body:{...pageB,text_connection_id:connectionA.id}});assert.equal(foreign.status,404);
   const update=await call('/api/connections/'+connectionA.id,{method:'PUT',cookie:b.cookie,body:{name:'Attack',provider:'openai',config:{}}});assert.equal(update.status,404);
  });
  await t.test('uploaded Bangla fonts are usable only inside their workspace and cannot become logos',async()=>{
   const bytes=await readFile(new URL('../assets/fonts/NotoSansBengali.ttf',import.meta.url)),dataURL='data:font/ttf;base64,'+bytes.toString('base64');
   assert.equal((await call('/api/brand-fonts',{method:'POST',cookie:a.cookie,body:{dataURL}})).status,400);
   const uploaded=await call('/api/brand-fonts',{method:'POST',cookie:a.cookie,body:{dataURL,licensed:true}});assert.equal(uploaded.status,200);assert.equal(uploaded.data.supportsBangla,true);
   assert((await call('/api/brand-fonts',{cookie:a.cookie})).data.some(f=>f.id===uploaded.data.id));
   assert(!(await call('/api/brand-fonts',{cookie:b.cookie})).data.some(f=>f.id===uploaded.data.id));
   assert.equal((await call('/api/assets/'+uploaded.data.id,{cookie:b.cookie})).status,404);
   assert.equal((await call('/api/pages/'+pageB.id,{method:'PUT',cookie:b.cookie,body:{...pageB,brand:{headlineFontAssetId:uploaded.data.id}}})).status,404);
   const page=await call('/api/pages/'+pageA.id,{method:'PUT',cookie:a.cookie,body:{...pageA,brand:{headlineFontAssetId:uploaded.data.id,bodyFontAssetId:uploaded.data.id}}});assert.equal(page.status,200);assert.equal(page.data.brand.headlineFontAssetId,uploaded.data.id);
   assert.equal((await call('/api/pages/'+pageA.id,{method:'PUT',cookie:a.cookie,body:{...pageA,brand:{logoAssetId:uploaded.data.id}}})).status,400);
  });
  await t.test('Content lists find recent publications beyond the overview window and isolate each Page/status before pagination',async()=>{
   let fixtures=[],otherPage;
   try{
    await transaction(a.workspace.id,async db=>{
     otherPage=(await db.query("INSERT INTO creator.pages(workspace_id,name,kind,niche,language) VALUES($1,'Content sibling fixture','education','Learning','English') RETURNING id",[a.workspace.id])).rows[0].id;
     fixtures=(await db.query("INSERT INTO creator.posts(workspace_id,page_id,type,title,status,created_at,updated_at) SELECT $1,$2,'original','Content window fixture '||n,'draft',now()-n*interval '1 second',now()-n*interval '1 second' FROM generate_series(1,310) n RETURNING id",[a.workspace.id,pageA.id])).rows.map(p=>p.id);
     const old=(await db.query("INSERT INTO creator.posts(workspace_id,page_id,type,title,status,created_at,updated_at,published_at) VALUES($1,$2,'original','Recently published oldest draft','published',now()-interval '90 days',now()-interval '90 days',now()-interval '1 minute'),($1,$2,'original','Earlier publication','published',now()-interval '80 days',now()-interval '80 days',now()-interval '2 days'),($1,$3,'original','Sibling publication','published',now()-interval '70 days',now()-interval '70 days',now()) RETURNING id",[a.workspace.id,pageA.id,otherPage])).rows.map(p=>p.id);fixtures.push(...old);
    });
    const overview=await call('/api/state',{cookie:a.cookie});assert.equal(overview.data.posts.length,300);assert(!overview.data.posts.some(p=>p.title==='Recently published oldest draft'));
    const list=await call('/api/posts?page='+pageA.id+'&status=published&limit=1',{cookie:a.cookie});assert.equal(list.status,200);assert.equal(list.data.posts[0].title,'Recently published oldest draft');assert.equal(list.data.total,2);assert.equal(list.data.hasMore,true);
    const next=await call('/api/posts?page='+pageA.id+'&status=published&limit=1&offset=1',{cookie:a.cookie});assert.equal(next.data.posts[0].title,'Earlier publication');assert.equal(next.data.hasMore,false);
    const sibling=await call('/api/posts?page='+otherPage+'&status=published',{cookie:a.cookie});assert.equal(sibling.data.posts.length,1);assert.equal(sibling.data.posts[0].title,'Sibling publication');
    const foreign=await call('/api/posts?page='+pageA.id+'&status=published',{cookie:b.cookie});assert.equal(foreign.data.total,0);assert.deepEqual(foreign.data.posts,[]);
    assert.equal((await call('/api/posts?status=not-a-status',{cookie:a.cookie})).status,400);
    const before=await call('/api/pulse',{cookie:a.cookie});await transaction(a.workspace.id,db=>db.query("UPDATE creator.posts SET status='draft',published_at=NULL WHERE workspace_id=$1 AND id=$2",[a.workspace.id,list.data.posts[0].id]));const after=await call('/api/pulse',{cookie:a.cookie});assert(BigInt(after.data.revision)>BigInt(before.data.revision));
    const fresh=await call('/api/posts?page='+pageA.id+'&status=published',{cookie:a.cookie});assert.equal(fresh.data.total,1);assert.equal(fresh.data.posts[0].title,'Earlier publication');
   }finally{await transaction(a.workspace.id,async db=>{if(fixtures.length)await db.query('DELETE FROM creator.posts WHERE workspace_id=$1 AND id=ANY($2::uuid[])',[a.workspace.id,fixtures]);if(otherPage)await db.query('DELETE FROM creator.pages WHERE workspace_id=$1 AND id=$2',[a.workspace.id,otherPage]);});}
  });
  await t.test('news captions enter a separate resumable website article stage before scheduling',async()=>{
   const sentence='স্থানীয় সড়কের বিষয়ে সংশ্লিষ্ট কর্তৃপক্ষ একটি নির্দেশনা দিয়েছে। সিদ্ধান্তের বিস্তারিত তথ্য প্রতিবেদনে তুলে ধরা হয়েছে।';let requests=0,fixtureConnection,fixturePost,fixtureWebsite;
   const oldURL=process.env.PLATFORM_OLLAMA_URL,oldRun=localInferenceGate.run;
   const mock=createServer(async(req,res)=>{res.setHeader('content-type','application/json');if(req.url==='/api/tags'||req.url==='/api/ps')return res.end(JSON.stringify({models:[{name:'news-fixture',size:2.5e9}]}));if(req.url==='/api/show')return res.end(JSON.stringify({capabilities:['completion']}));for await(const _ of req){};requests++;res.end(JSON.stringify({message:{content:(requests===1?sentence.repeat(12):'পরবর্তী তথ্য অনুযায়ী '+sentence.repeat(10))},done_reason:'stop'}));});
   await new Promise(r=>mock.listen(0,'127.0.0.1',r));process.env.PLATFORM_OLLAMA_URL='http://127.0.0.1:'+mock.address().port;localInferenceGate.run=createLocalInferenceGate({memory:()=>8*1024**3}).run;
   const before=await transaction(a.workspace.id,async db=>(await db.query('SELECT * FROM creator.pages WHERE id=$1',[pageA.id])).rows[0]);
   try{
    await transaction(a.workspace.id,async db=>{fixtureConnection=(await db.query("INSERT INTO creator.connections(workspace_id,name,provider,config,secret_cipher) VALUES($1,'Article fixture','ollama',$2,$3) RETURNING id",[a.workspace.id,{model:'news-fixture'},encryptSecret({},a.workspace.id)])).rows[0].id;fixtureWebsite=(await db.query("INSERT INTO creator.websites(workspace_id,name,url,kind,connector) VALUES($1,'Article source','https://news.example','news','wordpress') RETURNING id",[a.workspace.id])).rows[0].id;await db.query("UPDATE creator.pages SET kind='news',website_publishing=true,text_connection_id=$2,website_id=$3,require_review=true WHERE id=$1",[pageA.id,fixtureConnection,fixtureWebsite]);fixturePost=(await db.query("INSERT INTO creator.posts(workspace_id,page_id,type,title,body,caption,status) VALUES($1,$2,'news','সড়ক বিষয়ে নির্দেশনা',$3,$4,'review') RETURNING id",[a.workspace.id,pageA.id,sentence.repeat(30),sentence])).rows[0].id;});
    await continuePipeline({id:randomUUID(),workspace_id:a.workspace.id,page_id:pageA.id,post_id:fixturePost,kind:'generate',input:{}},{postId:fixturePost});
    const queued=await transaction(a.workspace.id,async db=>(await db.query('SELECT * FROM creator.tasks WHERE post_id=$1',[fixturePost])).rows);assert.equal(queued.length,1);assert.equal(queued[0].kind,'write_article');
    await runOne({excludePublish:true});const saved=await transaction(a.workspace.id,async db=>(await db.query('SELECT * FROM creator.posts WHERE id=$1',[fixturePost])).rows[0]);assert(saved.seo.article.text.length>saved.caption.length*5);assert(saved.seo.article.wordCount>80);assert.equal(saved.seo.articleDraft,undefined);assert.equal(requests,2);assert.equal(saved.status,'review');assert.equal(saved.approved_version,null);
    const list=await call('/api/state',{cookie:a.cookie});assert.equal(list.status,200);assert.equal(list.data.posts.find(p=>p.id===fixturePost).seo.article.text,undefined);assert(list.data.posts.find(p=>p.id===fixturePost).seo.article.wordCount>80);
   }finally{localInferenceGate.run=oldRun;if(oldURL===undefined)delete process.env.PLATFORM_OLLAMA_URL;else process.env.PLATFORM_OLLAMA_URL=oldURL;mock.closeAllConnections();await new Promise(r=>mock.close(r));await transaction(a.workspace.id,async db=>{await db.query('UPDATE creator.pages SET kind=$2,website_publishing=$3,text_connection_id=$4,require_review=$5,website_id=$6 WHERE id=$1',[pageA.id,before.kind,before.website_publishing,before.text_connection_id,before.require_review,before.website_id]);if(fixturePost){await db.query('DELETE FROM creator.tasks WHERE post_id=$1',[fixturePost]);await db.query('DELETE FROM creator.posts WHERE id=$1',[fixturePost]);}if(fixtureConnection)await db.query('DELETE FROM creator.connections WHERE id=$1',[fixtureConnection]);if(fixtureWebsite)await db.query('DELETE FROM creator.websites WHERE id=$1',[fixtureWebsite]);});}
  });
  await t.test('memory protection keeps preparation queued with its retry time and completed stage intact',async()=>{
   const previousReserve=process.env.PLATFORM_INFERENCE_RESERVE_MB;let task;
   try{
    task=await transaction(a.workspace.id,async db=>(await db.query("INSERT INTO creator.tasks(workspace_id,page_id,kind,progress,result) VALUES($1,$2,'generate',35,$3) RETURNING *",[a.workspace.id,pageA.id,{waiting:{code:'inference_resource_wait',stale:true}}])).rows[0]);
    process.env.PLATFORM_INFERENCE_RESERVE_MB='16384';assert.equal(await runOne({excludePublish:true}),true);
    const saved=await transaction(a.workspace.id,async db=>(await db.query('SELECT * FROM creator.tasks WHERE id=$1',[task.id])).rows[0]);
    assert.equal(saved.status,'queued');assert.equal(saved.progress,35);assert.equal(saved.lease_until,null);
    assert.equal(saved.result.waiting.code,'inference_resource_wait');assert.equal(saved.result.waiting.stale,undefined);
    assert.match(saved.phase,/Automatic retry in 5 minutes/);assert.equal(saved.events.at(-1).progress,35);
    assert.ok(+new Date(saved.not_before)-Date.now()>290000);assert.equal(saved.finished_at,null);
   }finally{if(previousReserve===undefined)delete process.env.PLATFORM_INFERENCE_RESERVE_MB;else process.env.PLATFORM_INFERENCE_RESERVE_MB=previousReserve;if(task)await transaction(a.workspace.id,db=>db.query('DELETE FROM creator.tasks WHERE id=$1',[task.id]));}
  });
  await t.test('expired text preparation resumes while an uncertain publication is held for reconciliation',async()=>{
   const ids=await transaction(a.workspace.id,async db=>(await db.query("INSERT INTO creator.tasks(workspace_id,page_id,kind,status,progress,lease_until) VALUES($1,$2,'generate','running',38,now()-interval '1 minute'),($1,$2,'publish','running',65,now()-interval '1 minute') RETURNING id",[a.workspace.id,pageA.id])).rows.map(r=>r.id));
   try{await recoverExpiredTasks();const rows=await transaction(a.workspace.id,async db=>(await db.query('SELECT kind,status,progress FROM creator.tasks WHERE id=ANY($1::uuid[])',[ids])).rows);assert.equal(rows.find(t=>t.kind==='generate').status,'queued');assert.equal(rows.find(t=>t.kind==='generate').progress,38);assert.equal(rows.find(t=>t.kind==='publish').status,'unknown');}finally{await transaction(a.workspace.id,db=>db.query('DELETE FROM creator.tasks WHERE id=ANY($1::uuid[])',[ids]));}
  });
  await t.test('owner database profiles are encrypted, tenant-isolated and explicitly stage recovery destinations',async()=>{
   const localURI=process.env.DATABASE_URL;
   assert.equal((await call('/api/owner/databases',{cookie:a.cookie})).status,403);
   const saved=await call('/api/owner/databases',{method:'POST',cookie:o.cookie,body:{name:'Isolated local test',provider:'local',connectionURL:localURI}});
   assert.equal(saved.status,200);assert.equal(saved.data.secret_cipher,undefined);assert(!JSON.stringify(saved.data).includes(new URL(localURI).password));
   const profile=saved.data.id;try{
    const tested=await call('/api/owner/databases/'+profile+'/test',{method:'POST',cookie:o.cookie,body:{}});assert.equal(tested.status,200);assert(tested.data.ok);
    const assigned=await call('/api/owner/workspaces/'+a.workspace.id+'/database',{method:'PUT',cookie:o.cookie,body:{profile_id:profile,mode:'dedicated_candidate'}});assert.equal(assigned.status,200);
    const list=await call('/api/owner/databases',{cookie:o.cookie});assert.equal(list.data.policy.automaticFailover,false);assert.equal(list.data.policy.dedicatedRouting,false);assert(list.data.assignments.some(x=>x.workspace_id===a.workspace.id&&x.state==='awaiting_snapshot'));
    const state=await call('/api/state',{cookie:a.cookie});assert(!JSON.stringify(state.data).includes(new URL(localURI).password));
   }finally{await transaction(null,async db=>{await db.query('DELETE FROM creator.workspace_database_targets WHERE profile_id=$1',[profile]);await db.query('DELETE FROM creator.database_profiles WHERE id=$1',[profile]);},{owner:true});}
  });
  await t.test('list reads are compact, authenticated detail is complete and pulse sees content changes',async()=>{
   const body='Long verified source facts. '.repeat(1000),before=await call('/api/pulse',{cookie:a.cookie});
   const made=await call('/api/posts',{method:'POST',cookie:a.cookie,body:{page_id:pageA.id,type:'original',title:'Detail hydration regression',body,caption:'A useful caption.'}});assert.equal(made.status,200);
   const id=made.data.id;try{const state=await call('/api/state',{cookie:a.cookie}),listed=state.data.posts.find(p=>p.id===id);assert.equal(listed.body.length,400);
    const full=await call('/api/posts/'+id,{cookie:a.cookie});assert.equal(full.data.body,body);
    const pulse=await call('/api/pulse',{cookie:a.cookie});assert(BigInt(pulse.data.revision)>BigInt(before.data.revision));assert.equal(pulse.data.posts,undefined);
    assert.equal((await call('/api/posts/'+id,{cookie:b.cookie})).status,404);
   }finally{await transaction(a.workspace.id,db=>db.query('DELETE FROM creator.posts WHERE workspace_id=$1 AND id=$2',[a.workspace.id,id]));}
  });
  await t.test('news aggregation is not available on ecommerce or general Pages',async()=>{
   assert.equal((await call('/api/feeds',{method:'POST',cookie:a.cookie,body:{name:'Not news',page_id:pageA.id,url:'https://example.com/feed'}})).status,400);
   assert.equal((await call('/api/pages/'+pageA.id+'/aggregate',{method:'POST',cookie:a.cookie,body:{}})).status,400);
  });
  await t.test('post edit/review/dry-run preserves isolation and does not consume publishing usage',async()=>{
   postA=(await call('/api/posts',{method:'POST',cookie:a.cookie,body:{page_id:pageA.id,type:'original',title:'A verified draft',instagram_caption:'A separate concise Instagram caption. #Learning',caption:'A factual caption with a clear message. #Education #Learning #Ideas'}})).data;
   assert.equal(postA.seo.channelCaptions.instagram,'A separate concise Instagram caption. #Learning');
   assert.equal((await call('/api/posts/'+postA.id+'/approve',{method:'POST',cookie:b.cookie,body:{}})).status,404);
   assert.equal((await call('/api/posts/'+postA.id+'/approve',{method:'POST',cookie:a.cookie,body:{}})).status,200);
   const dry=await call('/api/posts/'+postA.id+'/dry-run',{method:'POST',cookie:a.cookie,body:{}});assert.equal(dry.data.approvalReady,true);assert.equal(dry.data.automaticLinkComments,false);
   assert.equal((await call('/api/state',{cookie:a.cookie})).data.entitlements.posts_used,0);
   const edit=await call('/api/posts/'+postA.id,{method:'PUT',cookie:a.cookie,body:{...postA,instagram_caption:'Instagram edited after approval'}});assert.equal(edit.data.seo.channelCaptions.instagram,'Instagram edited after approval');assert.equal(edit.data.caption,postA.caption);assert.equal(edit.data.status,'draft');assert.equal(edit.data.approved_version,null);
  });
  await t.test('editorial learning is Page scoped, version checked and preserved by settings saves',async()=>{
   const foreign=await call('/api/posts/'+postA.id+'/feedback',{method:'POST',cookie:b.cookie,body:{outcome:'prefer',version:postA.version}});assert.equal(foreign.status,404);
   const current=(await call('/api/posts/'+postA.id,{cookie:a.cookie})).data;
   assert.equal((await call('/api/posts/'+postA.id+'/feedback',{method:'POST',cookie:a.cookie,body:{outcome:'prefer',version:current.version-1}})).status,409);
   assert.equal((await call('/api/posts/'+postA.id+'/feedback',{method:'POST',cookie:a.cookie,body:{outcome:'prefer',note:'Clear factual opening',version:current.version}})).status,200);
   let state=(await call('/api/state',{cookie:a.cookie})).data,p=state.pages.find(p=>p.id===pageA.id);assert.equal(p.creative_policy.editorialMemory.examples.length,1);
   const saved=await call('/api/pages/'+p.id,{method:'PUT',cookie:a.cookie,body:{...p,creative_policy:{editorial:{styleNotes:'Short, clear paragraphs'},editorialMemory:{examples:[{caption:'injected'}]}}}});assert.equal(saved.status,200);assert.equal(saved.data.creative_policy.editorialMemory.examples[0].note,'Clear factual opening');
   assert.equal((await call('/api/pages/'+p.id+'/reset-learning',{method:'POST',cookie:b.cookie,body:{}})).status,404);
   assert.equal((await call('/api/pages/'+p.id+'/reset-learning',{method:'POST',cookie:a.cookie,body:{}})).status,200);
  });
  await t.test('five concurrent reservations yield exactly three slots and cannot exceed trial',async()=>{
   const posts=[];for(let i=0;i<5;i++)posts.push((await call('/api/posts',{method:'POST',cookie:a.cookie,body:{page_id:pageA.id,type:'original',title:'Quota '+i,caption:'Test draft'}})).data);
   const results=await Promise.allSettled(posts.map(p=>transaction(a.workspace.id,db=>reservePublication(db,a.workspace.id,p.id))));assert.equal(results.filter(r=>r.status==='fulfilled').length,3);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='post_limit').length,2);
   const state=await call('/api/state',{cookie:a.cookie});assert.equal(state.data.entitlements.posts_used,3);assert.equal(state.data.entitlements.posts_remaining,0);
   const reserved=posts.find(p=>results[posts.indexOf(p)].status==='fulfilled');assert.equal((await call('/api/posts/'+reserved.id+'/draft',{method:'POST',cookie:a.cookie,body:{}})).status,200);assert.equal((await call('/api/state',{cookie:a.cookie})).data.entitlements.posts_used,2);
  });
  await t.test('database composite keys reject cross-workspace references',async()=>{
   await assert.rejects(()=>transaction(b.workspace.id,db=>db.query("INSERT INTO creator.posts(workspace_id,page_id,type,title) VALUES($1,$2,'original','attack')",[b.workspace.id,pageA.id])),e=>e.code==='23503');
   assert.equal((await query('SELECT count(*)::int AS count FROM creator.posts')).rows[0].count,0,'unscoped runtime role cannot read tenant posts');
   assert.equal((await transaction(b.workspace.id,db=>db.query('SELECT count(*)::int AS count FROM creator.posts WHERE workspace_id=$1',[a.workspace.id]))).rows[0].count,0,'RLS rejects a foreign workspace even when SQL asks for it');
   assert.equal((await query('SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0].rolbypassrls,false);
  });
  await t.test('calendar scheduling reserves, cancels and rejects times beyond trial expiry',async()=>{
   const prior=process.env.PLATFORM_PUBLISHING_ENABLED;process.env.PLATFORM_PUBLISHING_ENABLED='true';
   try{await transaction(a.workspace.id,db=>db.query("UPDATE creator.pages SET active=true,fb_verified=true,timezone='UTC',window_start='00:00',window_end='00:00' WHERE workspace_id=$1 AND id=$2",[a.workspace.id,pageA.id]));
    await call('/api/posts/'+postA.id+'/approve',{method:'POST',cookie:a.cookie,body:{}});
    const scheduled=await call('/api/posts/'+postA.id+'/schedule',{method:'POST',cookie:a.cookie,body:{scheduled_at:new Date(Date.now()+86400000).toISOString()}});assert.equal(scheduled.status,200);assert.equal(scheduled.data.kind,'publish');assert.equal((await call('/api/state',{cookie:a.cookie})).data.entitlements.posts_used,3);
    assert.equal((await call('/api/posts/'+postA.id+'/draft',{method:'POST',cookie:a.cookie,body:{}})).status,200);assert.equal((await call('/api/state',{cookie:a.cookie})).data.entitlements.posts_used,2);
    await call('/api/posts/'+postA.id+'/approve',{method:'POST',cookie:a.cookie,body:{}});
    assert.equal((await call('/api/posts/'+postA.id+'/schedule',{method:'POST',cookie:a.cookie,body:{scheduled_at:new Date(Date.now()+8*86400000).toISOString()}})).status,402);
   }finally{process.env.PLATFORM_PUBLISHING_ENABLED=prior;}
  });
  await t.test('approval, scheduling, rescheduling and trash operate on the current version atomically',async()=>{
   const prior=process.env.PLATFORM_PUBLISHING_ENABLED;process.env.PLATFORM_PUBLISHING_ENABLED='true';
   try{
    const p=(await call('/api/state',{cookie:a.cookie})).data.posts.find(p=>p.id===postA.id);
    const preparing=await call('/api/posts/'+p.id+'/creative',{method:'POST',cookie:a.cookie,body:{}});assert.equal(preparing.status,200);
    assert.equal((await call('/api/posts/'+p.id+'/schedule',{method:'POST',cookie:a.cookie,body:{autoPick:true,approve:true,version:p.version}})).status,409,'a queued image must finish before its version can be published');
    await transaction(a.workspace.id,db=>db.query("UPDATE creator.tasks SET status='canceled' WHERE id=$1",[preparing.data.id]));
    assert.equal((await call('/api/posts/'+p.id+'/schedule',{method:'POST',cookie:a.cookie,body:{autoPick:true,approve:true,version:p.version-1}})).status,409);
    const queued=await call('/api/posts/'+p.id+'/schedule',{method:'POST',cookie:a.cookie,body:{autoPick:true,approve:true,version:p.version}});assert.equal(queued.status,200,JSON.stringify(queued.data));
    const saved=(await call('/api/posts/'+p.id,{cookie:a.cookie})).data;assert.equal(saved.approved_version,saved.version);assert.equal(saved.status,'scheduled');
    assert.equal((await call('/api/posts/'+p.id+'/schedule',{method:'POST',cookie:a.cookie,body:{autoPick:true,version:p.version}})).status,200);
    assert.equal((await transaction(a.workspace.id,db=>db.query("SELECT count(*)::int AS count FROM creator.tasks WHERE post_id=$1 AND kind='publish' AND status='queued'",[p.id]))).rows[0].count,1);
    assert.equal((await call('/api/posts/'+p.id+'/delete',{method:'POST',cookie:b.cookie,body:{}})).status,404);
    assert.equal((await call('/api/posts/'+p.id+'/delete',{method:'POST',cookie:a.cookie,body:{}})).status,200);
    assert(!(await call('/api/state',{cookie:a.cookie})).data.posts.some(x=>x.id===p.id));assert((await call('/api/posts?bucket=trash',{cookie:a.cookie})).data.posts.some(x=>x.id===p.id));
    assert.equal((await call('/api/posts/'+p.id+'/restore',{method:'POST',cookie:a.cookie,body:{}})).status,200);
    const restored=(await call('/api/posts/'+p.id,{cookie:a.cookie})).data;assert.equal(restored.status,'draft');assert.equal(restored.approved_version,null);
    const planned=await call('/api/posts/'+p.id+'/schedule',{method:'POST',cookie:a.cookie,body:{autoPick:true,planOnly:true,version:restored.version}});assert.equal(planned.status,200);assert.equal(planned.data.planned,true);
    assert.equal((await call('/api/posts/'+p.id+'/approve',{method:'POST',cookie:a.cookie,body:{version:restored.version}})).status,200);
    assert.equal((await call('/api/posts/'+p.id,{cookie:a.cookie})).data.status,'scheduled');await call('/api/posts/'+p.id+'/draft',{method:'POST',cookie:a.cookie,body:{}});
   }finally{process.env.PLATFORM_PUBLISHING_ENABLED=prior;}
  });
  await t.test('automatic Pages schedule the final generated version and resume after connection; saved drafts stay paused',async()=>{
   const prior=process.env.PLATFORM_PUBLISHING_ENABLED;process.env.PLATFORM_PUBLISHING_ENABLED='true';
   try{
    await transaction(a.workspace.id,db=>db.query('UPDATE creator.pages SET require_review=false,active=true,fb_verified=false WHERE id=$1',[pageA.id]));
    const post=(await call('/api/posts',{method:'POST',cookie:a.cookie,body:{page_id:pageA.id,type:'original',title:'Automatic content fixture',caption:'A prepared caption with supporting facts and relevant hashtags. #Learning'}})).data;
    await transaction(a.workspace.id,db=>db.query("UPDATE creator.posts SET status='review',seo=$2 WHERE id=$1",[post.id,{editorialWarnings:['Fixture warning stays visible in automatic mode.']}]));
    await continuePipeline({id:randomUUID(),workspace_id:a.workspace.id,page_id:pageA.id,post_id:post.id,kind:'generate',input:{}},{postId:post.id});
    const planned=(await call('/api/posts/'+post.id,{cookie:a.cookie})).data;assert(planned.planned_at);assert.equal(planned.status,'review');
    await resumePreparedPosts();assert.equal((await call('/api/posts/'+post.id,{cookie:a.cookie})).data.status,'review','unverified Page does not publish');
    await transaction(a.workspace.id,db=>db.query('UPDATE creator.pages SET fb_verified=true WHERE id=$1',[pageA.id]));
    await resumePreparedPosts();const scheduled=(await call('/api/posts/'+post.id,{cookie:a.cookie})).data;assert.equal(scheduled.status,'scheduled');assert.equal(scheduled.approved_version,scheduled.version);assert.equal(scheduled.seo.editorialWarnings.length,1);
    assert.equal((await call('/api/posts/'+post.id+'/draft',{method:'POST',cookie:a.cookie,body:{}})).status,200);await resumePreparedPosts();assert.equal((await call('/api/posts/'+post.id,{cookie:a.cookie})).data.status,'draft');
    const fb=await transaction(a.workspace.id,async db=>(await db.query("INSERT INTO creator.connections(workspace_id,name,provider,config,secret_cipher) VALUES($1,'Auth pause fixture','facebook','{\"version\":\"v26.0\"}',$2) RETURNING id",[a.workspace.id,encryptSecret({token:'never-used-fixture'},a.workspace.id)])).rows[0]);
    await transaction(a.workspace.id,db=>db.query('UPDATE creator.pages SET facebook_connection_id=$2 WHERE id=$1',[pageA.id,fb.id]));
    const queued=await call('/api/posts/'+post.id+'/schedule',{method:'POST',cookie:a.cookie,body:{autoPick:true}});assert.equal(queued.status,200);
    await transaction(a.workspace.id,db=>pauseFacebookPage(db,a.workspace.id,pageA.id,fb.id,'Facebook token expired (190/463).'));
    const paused=(await call('/api/state',{cookie:a.cookie})).data;assert.equal(paused.pages.find(p=>p.id===pageA.id).fb_verified,false);assert.equal(paused.tasks.find(t=>t.id===queued.data.id).status,'blocked');assert.equal(paused.posts.find(p=>p.id===post.id).seo.deliveryBlock,'facebook_auth');
    assert.equal((await call('/api/posts/'+post.id+'/schedule',{method:'POST',cookie:a.cookie,body:{autoPick:true}})).status,409);
    await transaction(a.workspace.id,async db=>{await db.query('UPDATE creator.pages SET fb_verified=true WHERE id=$1',[pageA.id]);await db.query("UPDATE creator.posts SET last_error=NULL,seo=seo-'deliveryBlock' WHERE id=$1",[post.id]);});await resumePreparedPosts();assert.equal((await call('/api/posts/'+post.id,{cookie:a.cookie})).data.status,'scheduled');
    await call('/api/posts/'+post.id+'/draft',{method:'POST',cookie:a.cookie,body:{}});
    assert.equal((await call('/api/pages/'+pageA.id+'/facebook',{method:'POST',cookie:b.cookie,body:{}})).status,404);
    assert.equal((await call('/api/pages/'+pageB.id+'/facebook',{method:'POST',cookie:b.cookie,body:{connection_id:connectionA.id}})).status,404);
    assert.equal((await call('/api/pages/'+pageB.id+'/facebook',{method:'POST',cookie:b.cookie,body:{page_id:'not-numeric',version:'v26.0',token:'fake'}})).status,400);
   }finally{await transaction(a.workspace.id,db=>db.query('UPDATE creator.pages SET require_review=true WHERE id=$1',[pageA.id]));process.env.PLATFORM_PUBLISHING_ENABLED=prior;}
  });
  await t.test('profile scheduling is a manual handoff, metrics imports are isolated and manual confirmation is explicit',async()=>{
   const prior=process.env.PLATFORM_PUBLISHING_ENABLED;process.env.PLATFORM_PUBLISHING_ENABLED='true';
   try{
    const profile=(await call('/api/pages',{method:'POST',cookie:o.cookie,body:{name:'Owner profile fixture',niche:'Education',kind:'creator',language:'English',destination_type:'facebook_profile',profile_url:'https://www.facebook.com/profile.fixture',active:true,require_review:false,timezone:'UTC'}})).data;assert(profile.id);
    assert.equal((await call('/api/pages/'+profile.id+'/facebook',{method:'POST',cookie:o.cookie,body:{token:'not-real'}})).status,400);
    const p=(await call('/api/posts',{method:'POST',cookie:o.cookie,body:{page_id:profile.id,type:'original',title:'Manual profile fixture',caption:'An original, useful caption with verified facts.'}})).data;
    const schedule=await call('/api/posts/'+p.id+'/schedule',{method:'POST',cookie:o.cookie,body:{autoPick:true}});assert.equal(schedule.status,200,JSON.stringify(schedule.data));assert.equal(schedule.data.kind,'manual_handoff');
    await transaction(o.workspace.id,db=>db.query("UPDATE creator.tasks SET not_before=now()-interval '1 second' WHERE id=$1",[schedule.data.id]));await runOne({publishOnly:true});
    const ready=(await call('/api/posts/'+p.id,{cookie:o.cookie})).data;assert.equal(ready.status,'ready_manual');assert.equal(ready.fb_post_id,null);
    assert.equal((await call('/api/posts/'+p.id+'/confirm-manual',{method:'POST',cookie:o.cookie,body:{confirmed:true,url:'https://evil.example/post/1'}})).status,400);
    const done=await call('/api/posts/'+p.id+'/confirm-manual',{method:'POST',cookie:o.cookie,body:{confirmed:true,url:'https://www.facebook.com/profile.fixture/posts/123'}});assert.equal(done.status,200);assert.equal((await call('/api/posts/'+p.id,{cookie:o.cookie})).data.status,'published');
    const records=Array.from({length:5},(_,i)=>({type:'photo',publishedAt:new Date(Date.now()-i*86400000).toISOString(),reactions:10,comments:2,shares:1}));
    assert.equal((await call('/api/pages/'+profile.id+'/insights',{method:'POST',cookie:b.cookie,body:{records}})).status,404);
    assert.equal((await call('/api/pages/'+profile.id+'/insights',{method:'POST',cookie:o.cookie,body:{}})).status,400);
    assert.equal((await call('/api/pages/'+profile.id+'/insights',{method:'POST',cookie:o.cookie,body:{records}})).status,200);
    const snapshot=(await call('/api/state',{cookie:o.cookie})).data.insights.find(s=>s.page_id===profile.id);assert.equal(snapshot.summary.sampleSize,5);assert.equal(snapshot.summary.types[0].type,'photo');
   }finally{process.env.PLATFORM_PUBLISHING_ENABLED=prior;}
  });
  await t.test('Page routine configuration and logging references are workspace protected',async()=>{
   assert.equal((await call('/api/automations',{method:'POST',cookie:b.cookie,body:{page_id:pageA.id,name:'Cross workspace',enabled:false}})).status,404);
   assert.equal((await call('/api/automations',{method:'POST',cookie:a.cookie,body:{page_id:pageA.id,name:'Education routine',enabled:false,topic:'Explain one useful learning habit.',make_creative:true,auto_publish:false}})).status,200);
   const c=(await call('/api/connections',{method:'POST',cookie:a.cookie,body:{name:'Logging fixture',provider:'google_sheets',config:{spreadsheetId:'fixture_spreadsheet_id_1234',tab:'Posts'},secret:{serviceAccount:'not-real'}}})).data;
   const saved=await call('/api/pages/'+pageA.id,{method:'PUT',cookie:a.cookie,body:{...pageA,mirror_connection_ids:[c.id]}});assert.equal(saved.status,200);
   await call('/api/posts/'+postA.id,{method:'PUT',cookie:a.cookie,body:{...postA,caption:'Updated draft for logging'}});
   const logState=(await call('/api/state',{cookie:a.cookie})).data;assert(logState.mirrorStatus.some(x=>x.post_id===postA.id));
   assert.equal((await call('/api/pages/'+pageB.id,{method:'PUT',cookie:b.cookie,body:{...pageB,mirror_connection_ids:[c.id]}})).status,404);
   await call('/api/pages/'+pageA.id,{method:'PUT',cookie:a.cookie,body:{...pageA,mirror_connection_ids:[]}});
   await transaction(a.workspace.id,db=>db.query("INSERT INTO creator.legacy_imports(workspace_id,source,kind,source_id,resource_id,detail) VALUES($1,'fixture','page','fixture',$2,'{\"requiresCutover\":true}')",[a.workspace.id,pageA.id]));
   assert.equal((await call('/api/pages/'+pageA.id,{method:'PUT',cookie:a.cookie,body:{...pageA,active:true}})).status,409,'a migrated Page cannot start alongside its original publisher');
   assert.equal((await call('/api/connections',{method:'POST',cookie:a.cookie,body:{name:'Untrusted Comfy graph',provider:'comfyui',config:{workflow:{},promptNode:'6'}}})).status,403);
  });
  await t.test('automation pauses at its backlog limit and does not exceed its small batch or polling cadence',async()=>{
   await transaction(a.workspace.id,async db=>{await db.query('UPDATE creator.pages SET text_connection_id=$2 WHERE id=$1',[pageA.id,connectionA.id]);await db.query("UPDATE creator.automation_rules SET enabled=true,backlog_limit=1,next_run_at=now(),batch_size=2,daily_target=20 WHERE page_id=$1",[pageA.id]);});
   assert.equal((await tickAutomations()).queued,0);const blocked=(await call('/api/state',{cookie:a.cookie})).data.automation_rules.find(r=>r.page_id===pageA.id);assert.match(blocked.last_message,/backlog is full/);
   await transaction(a.workspace.id,db=>db.query('UPDATE creator.automation_rules SET backlog_limit=200,next_run_at=now() WHERE page_id=$1',[pageA.id]));
   const generated=await tickAutomations();assert(generated.queued>0&&generated.queued<=2);assert.equal((await tickAutomations()).queued,0,'a second check cannot bypass next_run_at');await transaction(a.workspace.id,db=>db.query('UPDATE creator.automation_rules SET enabled=false WHERE page_id=$1',[pageA.id]));
  });
  await t.test('shared n8n permissions are owner controlled and hidden from clients by default',async()=>{
   assert.equal((await call('/api/owner/integrations',{method:'PUT',cookie:a.cookie,body:{n8nEnabled:true,n8nVisibleToClients:true}})).status,403);
   assert.equal((await call('/api/global-integrations/test',{method:'POST',cookie:a.cookie,body:{}})).status,403);
   assert.equal((await call('/api/owner/integrations',{method:'PUT',cookie:o.cookie,body:{n8nEnabled:true,n8nVisibleToClients:true}})).status,200);
   assert.equal((await call('/api/state',{cookie:a.cookie})).data.globalIntegrations.n8nVisible,true);
   await call('/api/owner/integrations',{method:'PUT',cookie:o.cookie,body:{n8nEnabled:false,n8nVisibleToClients:false}});
  });
  await t.test('priority catalog generation is tenant-scoped, deduplicated and exposes only a signed JPEG',async()=>{
   const privateModel=(await call('/api/connections',{method:'POST',cookie:b.cookie,body:{name:'Catalog fixture model',provider:'openai',config:{model:'fixture'}}})).data;
   const product=await transaction(b.workspace.id,async db=>{const site=(await db.query("INSERT INTO creator.websites(workspace_id,name,url,kind,connector) VALUES($1,'Fixture store','https://example.com','ecommerce','json_catalog') RETURNING id",[b.workspace.id])).rows[0];await db.query("UPDATE creator.pages SET kind='ecommerce',website_id=$3,text_connection_id=$4 WHERE workspace_id=$1 AND id=$2",[b.workspace.id,pageB.id,site.id,privateModel.id]);return (await db.query("INSERT INTO creator.products(workspace_id,website_id,external_id,title,url,attributes) VALUES($1,$2,'catalog-fixture','Cotton shirt','https://example.com/shirt','{\"category\":\"Shirts\",\"material\":\"Cotton\"}') RETURNING *",[b.workspace.id,site.id])).rows[0];});
   assert.equal((await call('/api/products/'+product.id+'/prepare',{method:'POST',cookie:a.cookie,body:{page_id:pageA.id,urgent:true}})).status,404);
   const first=await call('/api/products/'+product.id+'/prepare',{method:'POST',cookie:b.cookie,body:{page_id:pageB.id,urgent:true,ratio:'4:5'}});assert.equal(first.status,200,JSON.stringify(first.data));assert.equal(first.data.input.urgent,true);
   const repeated=await call('/api/products/'+product.id+'/prepare',{method:'POST',cookie:b.cookie,body:{page_id:pageB.id,urgent:true}});assert.equal(repeated.data.postId,first.data.postId);
   const image=await saveAsset(b.workspace.id,first.data.postId,{bytes:await sharp({create:{width:80,height:80,channels:3,background:'#123456'}}).png().toBuffer(),mime:'image/png',width:80,height:80});await transaction(b.workspace.id,db=>db.query('INSERT INTO creator.assets(id,workspace_id,post_id,path,mime,width,height) VALUES($1,$2,$3,$4,$5,80,80)',[image.id,b.workspace.id,first.data.postId,image.path,image.mime]));
   assert.equal((await fetch(origin+'/api/assets/'+image.id)).status,401);
   const signed=signedMediaURL(b.workspace.id,image.id),response=await fetch(signed);assert.equal((await fetch(signed,{method:'HEAD'})).status,200);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/image\/jpeg/);assert.equal((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).width,1080);
   const tampered=new URL(signed);tampered.searchParams.set('workspace',a.workspace.id);assert.equal((await fetch(tampered)).status,404);
   await transaction(b.workspace.id,db=>db.query('UPDATE creator.products SET available=false WHERE workspace_id=$1 AND id=$2',[b.workspace.id,product.id]));assert.equal((await call('/api/products/'+product.id+'/prepare',{method:'POST',cookie:b.cookie,body:{page_id:pageB.id}})).status,409);
  });
  await t.test('delayed comments and branding respect timing, ownership and uncertain-write protection',()=>verifyExpandedOperations({a,b,pageA,pageB,call}));
  await t.test('only owner may set pricing and approve manually verified payments, exactly once',async()=>{
   assert.equal((await call('/api/owner/state',{cookie:a.cookie})).status,403);assert.throws(()=>requireOwner({role:'super_admin',email_verified:false}));
   const ownerState=(await call('/api/owner/state',{cookie:o.cookie})).data,plan=ownerState.plans.find(p=>p.id==='starter');
   assert.equal((await call('/api/owner/plans/starter',{method:'PUT',cookie:o.cookie,body:{...plan,usd_minor:1500,bdt_minor:180000}})).status,200);
   assert.equal((await call('/api/owner/payment-methods/bank',{method:'PUT',cookie:o.cookie,body:{enabled:true,instructions:'TEST ONLY: no actual funds, test reference required'}})).status,200);
   const payment=await call('/api/payments',{method:'POST',cookie:b.cookie,body:{plan_id:'starter',method:'bank',currency:'USD',reference:'test-'+suffix,amount_minor:1}});assert.equal(payment.status,200);assert.equal(payment.data.amount_minor,1500);assert.equal(payment.data.status,'pending');
   assert.equal((await call('/api/owner/payments/'+payment.data.id+'/approve',{method:'POST',cookie:a.cookie,body:{}})).status,403);
   assert.equal((await call('/api/owner/payments/'+payment.data.id+'/approve',{method:'POST',cookie:o.cookie,body:{note:'Automated fixture; no funds transferred'}})).status,200);
   assert.equal((await call('/api/owner/payments/'+payment.data.id+'/approve',{method:'POST',cookie:o.cookie,body:{}})).status,409);
   assert.equal((await call('/api/state',{cookie:b.cookie})).data.entitlements.plan_id,'starter');
   // Restore catalog configuration; test receipts must never become public instructions.
   await call('/api/owner/plans/starter',{method:'PUT',cookie:o.cookie,body:plan});await call('/api/owner/payment-methods/bank',{method:'PUT',cookie:o.cookie,body:{enabled:false,instructions:''}});
  });
  await t.test('suspended accounts and expired trials cannot keep using worker features',async()=>{
   assert.equal((await call('/api/owner/accounts/'+b.actor.id,{method:'PUT',cookie:o.cookie,body:{status:'suspended'}})).status,200);assert.equal((await call('/api/state',{cookie:b.cookie})).status,403);
   await transaction(a.workspace.id,db=>db.query("UPDATE creator.subscriptions SET period_end=now()-interval '1 second' WHERE workspace_id=$1",[a.workspace.id]));assert.equal((await call('/api/posts/'+postA.id+'/generate',{method:'POST',cookie:a.cookie,body:{}})).status,402);
  });
  await t.test('sign out invalidates the real session',async()=>{
   assert.equal((await call('/api/auth/sign-out',{method:'POST',cookie:a.cookie,body:{}})).status,200);assert.equal((await call('/api/state',{cookie:a.cookie})).status,401);
  });
 }finally{
  try{await transaction(null,async db=>{
   await db.query('DELETE FROM creator.activity WHERE actor_id=ANY($1::uuid[])',[accounts.map(a=>a.id)]);
   for(const account of accounts){const w=account.w;for(const table of ['approval_notifications','publication_deliveries','link_comments','analytics_reports','page_branding','social_deliveries','social_destinations','insight_snapshots','checkout_intents','page_connections','mirror_outbox','page_mirrors','legacy_imports','publish_attempts','usage_reservations','assets','tasks','ad_drafts','campaigns','payments','activity','posts','products','feeds','automation_rules','pages','websites','connections'])await db.query(`DELETE FROM creator.${table} WHERE workspace_id=$1`,[w]);await db.query('DELETE FROM creator.subscriptions WHERE workspace_id=$1',[w]);await db.query('DELETE FROM creator.memberships WHERE workspace_id=$1',[w]);await db.query('DELETE FROM creator.workspaces WHERE id=$1',[w]);await db.query('DELETE FROM creator.accounts WHERE id=$1',[account.id]);}
   for(const account of accounts)await db.query('DELETE FROM public.auth_user WHERE id=$1',[account.subject]);
  },{owner:true});}finally{
  await Promise.all(mailFiles.map(f=>unlink(f).catch(()=>{})));server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await closeDatabase();process.env.PLATFORM_PORT=original.port;process.env.PLATFORM_ORIGIN=original.origin;process.env.PLATFORM_OWNER_EMAIL=original.owner;
  }
 }
});
