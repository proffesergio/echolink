import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile,unlink} from 'node:fs/promises';
import '../server/env.mjs';
import {createApp} from '../server/index.mjs';
import {query,transaction,closeDatabase} from '../server/db.mjs';
import {reservePublication} from '../server/quotas.mjs';
import {requireOwner} from '../server/auth.mjs';
import {tickAutomations,continuePipeline,resumePreparedPosts,runOne} from '../server/jobs.mjs';
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
   assert.equal((await call('/api/state')).status,401);a=await signup('Alpha creator','alpha-'+suffix+'@example.com');b=await signup('Beta creator','beta-'+suffix+'@example.com');o=await signup('Test platform owner',ownerEmail);assert.notEqual(a.workspace.id,b.workspace.id);assert.equal(a.actor.role,'admin');assert.equal(o.actor.role,'super_admin');
  });
  if(!a||!b||!o)throw new Error('Account setup failed.');
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
  await t.test('news aggregation is not available on ecommerce or general Pages',async()=>{
   assert.equal((await call('/api/feeds',{method:'POST',cookie:a.cookie,body:{name:'Not news',page_id:pageA.id,url:'https://example.com/feed'}})).status,400);
   assert.equal((await call('/api/pages/'+pageA.id+'/aggregate',{method:'POST',cookie:a.cookie,body:{}})).status,400);
  });
  await t.test('post edit/review/dry-run preserves isolation and does not consume publishing usage',async()=>{
   postA=(await call('/api/posts',{method:'POST',cookie:a.cookie,body:{page_id:pageA.id,type:'original',title:'A verified draft',caption:'A factual caption with a clear message. #Education #Learning #Ideas'}})).data;
   assert.equal((await call('/api/posts/'+postA.id+'/approve',{method:'POST',cookie:b.cookie,body:{}})).status,404);
   assert.equal((await call('/api/posts/'+postA.id+'/approve',{method:'POST',cookie:a.cookie,body:{}})).status,200);
   const dry=await call('/api/posts/'+postA.id+'/dry-run',{method:'POST',cookie:a.cookie,body:{}});assert.equal(dry.data.approvalReady,true);assert.equal(dry.data.automaticLinkComments,false);
   assert.equal((await call('/api/state',{cookie:a.cookie})).data.entitlements.posts_used,0);
   const edit=await call('/api/posts/'+postA.id,{method:'PUT',cookie:a.cookie,body:{...postA,caption:'Changed after approval'}});assert.equal(edit.data.status,'draft');assert.equal(edit.data.approved_version,null);
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
   for(const account of accounts){const w=account.w;for(const table of ['social_deliveries','social_destinations','insight_snapshots','checkout_intents','page_connections','mirror_outbox','page_mirrors','legacy_imports','publish_attempts','usage_reservations','assets','tasks','ad_drafts','campaigns','payments','activity','posts','products','feeds','automation_rules','pages','websites','connections'])await db.query(`DELETE FROM creator.${table} WHERE workspace_id=$1`,[w]);await db.query('DELETE FROM creator.subscriptions WHERE workspace_id=$1',[w]);await db.query('DELETE FROM creator.memberships WHERE workspace_id=$1',[w]);await db.query('DELETE FROM creator.workspaces WHERE id=$1',[w]);await db.query('DELETE FROM creator.accounts WHERE id=$1',[account.id]);}
   for(const account of accounts)await db.query('DELETE FROM public.auth_user WHERE id=$1',[account.subject]);
  },{owner:true});}finally{
  await Promise.all(mailFiles.map(f=>unlink(f).catch(()=>{})));server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await closeDatabase();process.env.PLATFORM_PORT=original.port;process.env.PLATFORM_ORIGIN=original.origin;process.env.PLATFORM_OWNER_EMAIL=original.owner;
  }
 }
});
