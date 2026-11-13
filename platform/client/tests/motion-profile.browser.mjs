// Run after the platform build: node client/tests/motion-profile.browser.mjs
// Serves the built client with intercepted APIs; never contacts the worker.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';

const root=resolve(fileURLToPath(new URL('../../dist/',import.meta.url)));
const policy={captionInstructions:'  Manually added বাংলা caption\nKeep spacing & {{variables}}.  ',imageInstructions:'Original image prompt\nDo not replace.',postTypePrompts:{original:{caption:'Original type caption',image:'Original type image'},image:{caption:'Manual photo caption',image:'Manual photo art direction'}},channelCaptions:{facebook:{instructions:'Manual Facebook instructions'},instagram:{instructions:'Manual Instagram instructions'}},backgroundMode:'studio',goal:'engagement'};
const profile={id:'fixture-profile',name:'FB Profile Fixture',niche:'Education',kind:'creator',entity_type:'PERSONAL_PROFILE',destination_type:'facebook_profile',language:'Bangla',profile_url:'https://www.facebook.com/fixture',active:false,aggregation_enabled:false,website_publishing:false,require_review:true,daily_cap:3,gap_minutes:60,timezone:'Asia/Dhaka',window_start:'00:00',window_end:'00:00',brand:{color:'#ff826b'},creative_policy:policy,profile_config:{language_mode:'SINGLE_LANGUAGE',primary_language:'bn',languages:['bn'],content_workflow:'TEXT',domain_preset:'GENERAL'}};
const state={actor:{name:'Fixture',role:'admin'},workspace:{id:'fixture-workspace',onboarded:true,niche:'Education',language:'Bangla'},pages:[profile],posts:[],connections:[],websites:[],feeds:[],products:[],tasks:[{id:'task',page_id:profile.id,kind:'generate',status:'running',progress:25,phase:'Content synthesis',started_at:new Date().toISOString(),created_at:new Date().toISOString(),events:[]}],calendar:[],automation_rules:[],campaigns:[],ad_drafts:[],activity:[],providers:[],plans:[],payments:[],pageMirrors:[],entitlements:{plan_name:'Fixture',database_now:new Date().toISOString()},telemetry:{contentRevision:'fixture'},environment:'test'};
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp'};
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://fixture').pathname;
  // Fail closed even if interception regresses.
  if(path.startsWith('/api/')){res.writeHead(503);return res.end('No worker in this test');}
  let file=resolve(root,'.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(root+sep)){res.writeHead(404);return res.end();}
  const data=await readFile(file);res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'});res.end(data);
 }catch{res.writeHead(404);res.end();}
});
let browser;
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[],writes=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>localStorage.setItem('echolink.activePage','fixture-profile'));
 await context.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(!['GET','HEAD'].includes(req.method())){
   writes.push({path,method:req.method(),data:req.postDataJSON()});
   assert.equal(path,'/api/pages/fixture-profile','Only the explicit mocked settings save is allowed');
   return route.fulfill({json:{message:'Mock saved'}});
  }
  if(path==='/api/state')return route.fulfill({json:state});
  if(path==='/api/public')return route.fulfill({json:{identity:{}}});
  if(path==='/api/pulse')return route.fulfill({json:{revision:'fixture',tasks:state.tasks,at:new Date().toISOString()}});
  if(path==='/api/content-events')return route.fulfill({contentType:'text/event-stream',body:'retry: 60000\n\n'});
  return route.fulfill({json:[]});
 });
 const origin='http://127.0.0.1:'+server.address().port;
 const overflow=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal document overflow');
 await page.goto(origin+'/?view=prompts');
 await page.getByRole('heading',{name:'FB Profile Fixture prompt library'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Edit Profile prompts',exact:true}).count(),1);
 assert.equal(await page.getByRole('button',{name:'Page settings',exact:true}).count(),0);
 await page.getByRole('button',{name:'Edit Profile prompts',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('heading',{name:'Profile settings',exact:true}).waitFor();
 await dialog.getByLabel('Profile name',{exact:true}).waitFor();
 await dialog.getByRole('tab',{name:'Writing & prompts',exact:true}).click();
 assert.equal(await dialog.getByLabel('Caption instructions',{exact:true}).inputValue(),policy.captionInstructions);
 assert.equal(await dialog.getByLabel('Image art direction',{exact:true}).inputValue(),policy.imageInstructions);
 // Mounted hidden panels preserve unsaved input through navigation and responsive changes.
 const unsaved=policy.captionInstructions+'\nUnsaved edit';
 await dialog.getByLabel('Caption instructions',{exact:true}).fill(unsaved);
 await dialog.getByRole('tab',{name:'General',exact:true}).click();
 await dialog.getByRole('tab',{name:'Brand & design',exact:true}).click();
 assert.notEqual(await dialog.locator('.settings-section-nav .settings-masked-icon').first().evaluate(el=>getComputedStyle(el).maskImage),'none','Bundled SVG data URLs must remain valid CSS masks');
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});await overflow();}
 await dialog.getByRole('tab',{name:'Writing & prompts',exact:true}).click();
 assert.equal(await dialog.getByLabel('Caption instructions',{exact:true}).inputValue(),unsaved);
 await dialog.getByLabel('Caption instructions',{exact:true}).fill(policy.captionInstructions);
 assert.deepEqual(writes,[],'Opening, navigating and resizing never saves defaults');
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await dialog.evaluate(el=>getComputedStyle(el).animationName),'none');
 await dialog.getByRole('button',{name:'Save changes',exact:true}).click();
 await dialog.waitFor({state:'hidden'});
 assert.equal(writes.length,1);
 assert.deepEqual(writes[0].data.creative_policy,policy,'All supported manual prompts and whitespace survive an unchanged save');
 assert.deepEqual(writes[0].data.profile_config,profile.profile_config,'Existing workflow and language preferences survive an unchanged save');
 // No inference or publication requests are permitted by this mock.
 await page.goto(origin+'/?view=studio');
 await page.getByRole('heading',{name:'FB Profile Fixture studio'}).waitFor();
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});await overflow();}
 assert.equal(await page.locator('.ai-wave-layer').first().evaluate(el=>getComputedStyle(el).animationName),'none');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.getByRole('button',{name:'Pause animation',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Resume animation',exact:true}).getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('.ai-wave-layer').first().evaluate(el=>getComputedStyle(el).animationPlayState),'paused');
 assert.deepEqual(errors,[],'No browser JavaScript errors');
 assert.equal(writes.length,1,'No implicit saves, generation or publication');
 console.log(JSON.stringify({passed:true,widths:[320,390,768,1280],profileTerminology:true,manualPromptsPreserved:true,existingProfileConfigPreserved:true,unsavedEditPreserved:true,reducedMotion:true,pauseAnimation:true,javaScriptErrors:0,mockedSaves:writes.length,realApiRequests:0}));
}finally{
 await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));
}
