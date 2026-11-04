import '../src/env.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {query,closePools} from '../src/db.mjs';
import {hash,candidateGenerationBody} from '../src/core.mjs';
import {articleAction} from '../src/newsroom-actions.mjs';
import {processQueue,comments,generate} from '../src/jobs.mjs';
import {deliveryGate,clearDeliveryPause} from '../src/facebook.mjs';
if(!process.env.ECHOLINK_TEST_BRANCH)throw new Error('Disposable test branch required');
const originalFetch=globalThis.fetch,calls=[];
let response={id:'123_456'},responseStatus=200,responseHeaders={};
let modelResponse,modelCalls=0;
// This test exercises real HTTP payload generation and durable DB transitions,
// but never makes a Facebook request or alters the production database.
globalThis.fetch=async(url,options)=>{
  if(new URL(url).hostname==='127.0.0.1'&&new URL(url).pathname==='/v1/chat/completions'&&modelResponse){modelCalls++;return Response.json({choices:[{message:{content:JSON.stringify(modelResponse)}}]});}
  if(new URL(url).hostname!=='graph.facebook.com')throw new Error('External adapters disabled in delivery test');
  if(String(url).includes('/debug_token'))return Response.json({data:{is_valid:true,type:'PAGE',scopes:['pages_read_engagement','pages_manage_posts','pages_manage_engagement']}});
  if(String(url).includes('/me?'))return Response.json({id:'123',name:'Delivery probe'});
  calls.push({url:String(url),body:JSON.parse(options.body)});
  return Response.json(response,{status:responseStatus,headers:responseHeaders});
};
process.env.DRY_RUN='false';process.env.META_GRAPH_VERSION='v26.0';process.env.FB_TOKENS_JSON=JSON.stringify({deliveryProbe:'fake-token'});
const pageId='recDeliveryProbe',page={id:pageId,name:'Delivery probe',active:true,fbPageId:'123',fbSecret:'deliveryProbe',timezone:'Asia/Dhaka',start:'00:00',end:'00:00',dailyMax:3,minimumGap:60,approval:true,commentDelay:5};
const make=async(status='Draft',at=null)=>{
  const id=randomUUID(),caption='পরীক্ষামূলক পর্যালোচিত সংবাদ। #বাংলাদেশ';
  await query("INSERT INTO echolink.articles(id,page_id,url_hash,title_hash,title,source_url,body,caption,caption_hash,approval_hash,image_url,status,scheduled_at,source_published_at) VALUES($1,$2,$3,$3,'Delivery probe','https://example.com/story','Body',$4,$5,$5,'https://example.com/photo.jpg',$6,$7,now())",[id,pageId,randomUUID(),caption,hash(caption),status,at]);return id;
};
const reset=async()=>{await query('DELETE FROM echolink.facebook_delivery WHERE page_id=$1',[pageId]);await query("UPDATE echolink.articles SET status='Draft' WHERE page_id=$1",[pageId]);};
try{
  await query("INSERT INTO echolink.configurations(kind,id,config) VALUES('page',$1,$2)",[pageId,JSON.stringify(page)]);
  const first=await make();const action=await articleAction(first,'publish',{confirmed:true});assert.ok(action.runId);
  for(let i=0;i<100;i++){const run=(await query('SELECT status FROM echolink.job_runs WHERE id=$1',[action.runId])).rows[0];if(run.status!=='Running')break;await new Promise(r=>setTimeout(r,100));}
  const posted=(await query('SELECT * FROM echolink.articles WHERE id=$1',[first])).rows[0];assert.equal(posted.status,'Posted');assert.equal(posted.fb_post_id,'123_456');
  assert.match(calls[0].url,/\/photos$/);assert.equal(calls[0].body.caption,posted.caption);assert.equal(calls[0].body.url,posted.image_url);
  const comment=(await query('SELECT * FROM echolink.source_comments WHERE article_id=$1',[first])).rows[0];assert.ok(comment.due_at-posted.published_at>=299000);assert.equal(comment.status,'Queued');
  assert.equal((await comments({pageId})).sent,0);
  await query("UPDATE echolink.source_comments SET due_at=now()-interval '1 second' WHERE article_id=$1",[first]);response={id:'123_comment'};
  assert.equal((await comments({pageId})).sent,1);assert.match(calls.at(-1).url,/\/123_456\/comments$/);assert.equal(calls.at(-1).body.message,'সূত্র: https://example.com/story');assert.equal((await comments({pageId})).sent,0);
  const second=await make();await assert.rejects(articleAction(second,'publish',{confirmed:true}),/spacing|gap|minutes/);
  await reset();const throttle=await make('Approved');response={error:{code:32,message:'Never store arbitrary upstream text'}};responseStatus=400;responseHeaders={'Retry-After':'1200'};
  assert.equal((await processQueue({pageId,articleId:throttle})).pages[0].queued,throttle);assert.equal((await deliveryGate(pageId)).ready,false);
  const callCount=calls.length;await processQueue({pageId,articleId:throttle});assert.equal(calls.length,callCount,'Cooldown must prevent another HTTP write');
  await reset();const expired=await make('Approved');response={error:{code:190}};responseHeaders={};await processQueue({pageId,articleId:expired});assert.equal((await deliveryGate(pageId)).ready,false);await clearDeliveryPause(pageId);assert.equal((await deliveryGate(pageId)).ready,true);
  await reset();const scheduled=await make('Approved',new Date(Date.now()-7*3600000));const before=calls.length;await processQueue({pageId,articleId:scheduled});assert.equal((await query('SELECT status FROM echolink.articles WHERE id=$1',[scheduled])).rows[0].status,'Draft');assert.equal(calls.length,before);
  await reset();const preview=await make('Approved');await processQueue({pageId,articleId:preview,preview:true});assert.equal((await query('SELECT status FROM echolink.articles WHERE id=$1',[preview])).rows[0].status,'Pending Approval');assert.equal(calls.length,before,'Live-mode previews never publish');
  await reset();for(let i=0;i<3;i++)await make('Pending Approval');const raw=await make('Queued');await query('UPDATE echolink.articles SET caption=NULL,caption_hash=NULL,approval_hash=NULL WHERE id=$1',[raw]);
  assert.match((await processQueue({pageId,articleId:raw})).pages[0].queued,/Review queue has 3 drafts/);assert.equal(calls.length,before);
  await reset();response={id:'123_editorial'};responseStatus=200;responseHeaders={};
  const automaticPage={...page,approval:false,infrastructure:'Ollama',endpoint:'http://127.0.0.1:11434/v1/chat/completions',model:'test-model',language:'Bangla',temperature:0.2};
  await query("UPDATE echolink.configurations SET config=$2 WHERE kind='page' AND id=$1",[pageId,JSON.stringify(automaticPage)]);
  const unsupported=await make('Queued');
  await query("UPDATE echolink.articles SET body='সূত্রে ২০ জনের কথা আছে।',caption='সংবাদে ৩৭ জনের উল্লেখ।',caption_hash=$2,approval_hash=NULL WHERE id=$1",[unsupported,hash('সংবাদে ৩৭ জনের উল্লেখ।')]);
  const noWrites=calls.length;
  assert.equal((await processQueue({pageId,articleId:unsupported})).pages[0].pending,unsupported);
  assert.match((await query('SELECT last_error FROM echolink.articles WHERE id=$1',[unsupported])).rows[0].last_error,/37/);
  assert.equal(calls.length,noWrites,'An unsupported figure must not trigger a Facebook write');
  for(const check of [
    {body:'হার ৫৩ শতাংশ থেকে ৪২ শতাংশে নেমেছে।',caption:'হার ৪২ শতাংশ থেকে ৫৩ শতাংশে উঠেছে।',reason:/reverses a numeric transition/},
    {body:'অনুষ্ঠানের তারিখ ঘোষণা করা হয়নি।',caption:'কর্তৃপক্ষ বলেছে, “আগামী শনিবার থেকে অনুষ্ঠান শুরু হবে।”',reason:/direct quotation/},
    {body:'জরিপের পরিবর্তনের কারণ উল্লেখ করা হয়নি।',caption:'স্থানীয় প্রশাসন ভবনগুলোর সংস্কার ও তদারকির ওপর জোর দিচ্ছে।',reason:/not described in the supplied source/},
    {body:'আগের মাসে হার ৫৩ শতাংশ। চলতি মাসে হার ৪২ শতাংশ।',caption:'চলতি মাসে হার বেড়ে ৪২ শতাংশ হয়েছে, যেখানে আগের মাসে এই হার ছিল ৫৩ শতাংশ।',reason:/increase\/decrease wording/},
    {body:'আগের মাসে হার ৫৩ শতাংশ। চলতি মাসে হার ৪২ শতাংশ।',caption:'বর্তমানে হার কমে ৪২ শতাংশ হয়েছে।',analysis:'হার ৪১ শতাংশ কমেছে।',reason:/analysis numbers.*41/}
  ]){
    const id=await make('Queued');await query('UPDATE echolink.articles SET body=$2,caption=$3,caption_hash=$4,analysis=$5,approval_hash=NULL WHERE id=$1',[id,check.body,check.caption,hash(check.caption),check.analysis||null]);
    assert.equal((await processQueue({pageId,articleId:id})).pages[0].pending,id);
    assert.match((await query('SELECT last_error FROM echolink.articles WHERE id=$1',[id])).rows[0].last_error,check.reason);
    assert.equal(calls.length,noWrites,'A factual review signal must hold before Facebook');
  }
  const flagged=await make('Queued');
  await query("UPDATE echolink.articles SET analysis='EDITORIAL REVIEW REQUIRED: conflicting figures 53% versus 42%',approval_hash=NULL WHERE id=$1",[flagged]);
  assert.equal((await processQueue({pageId,articleId:flagged})).pages[0].pending,flagged);
  assert.equal(calls.length,noWrites,'A stored source-conflict warning must hold an approval-free Page');
  await articleAction(flagged,'approve',{confirmed:true});
  assert.equal((await processQueue({pageId,articleId:flagged})).pages[0].posted,flagged,'Explicit matching human approval may release the hold');
  await reset();const generated=await make('Queued');
  await query("UPDATE echolink.articles SET caption=NULL,caption_hash=NULL,approval_hash=NULL,body='সূত্রে ২০ জনের উল্লেখ আছে।' WHERE id=$1",[generated]);
  modelResponse={caption:'সংবাদে ২০ জনের উপস্থিতির তথ্য জানানো হয়েছে। বিষয়টি সম্পর্কে সূত্রে পাওয়া তথ্য অনুযায়ী এই সংক্ষিপ্ত প্রতিবেদন তৈরি করা হয়েছে।\n\nপ্রতিবেদনের সংখ্যাগত তথ্য যাচাই করে দেখা প্রয়োজন। মূল সূত্রে বর্ণিত ঘটনাটি নিয়ে আরও বিস্তারিত তথ্য নিশ্চিত না হওয়া পর্যন্ত কোনো অতিরিক্ত দাবি করা হচ্ছে না।',analysis:'EDITORIAL REVIEW REQUIRED: সূত্রের একই ঘটনার সংখ্যাগত তথ্য পরস্পরবিরোধী; প্রকাশের আগে তা মিলিয়ে দেখা প্রয়োজন।',image_prompt:'Neutral editorial illustration'};
  const beforeGeneration=calls.length;
  assert.equal((await processQueue({pageId,articleId:generated})).pages[0].pending,generated);
  const held=(await query('SELECT status,caption,analysis,last_error FROM echolink.articles WHERE id=$1',[generated])).rows[0];
  assert.equal(held.caption,modelResponse.caption);assert.match(held.analysis,/EDITORIAL REVIEW REQUIRED/);assert.match(held.last_error,/analysis flags/);
  assert.equal(calls.length,beforeGeneration,'A freshly generated warning must hold within the same run');
  await reset();
  modelResponse={...modelResponse,analysis:'The source requires additional verification before publication.'};const priorModelCalls=modelCalls,priorWrites=calls.length;
  await assert.rejects(generate(automaticPage,{title:'Diagnostic fixture',body:'সূত্রে ২০ জনের উল্লেখ আছে।'},{bodyBuilder:candidateGenerationBody,checkAnalysisLanguage:true}),/Analysis does not use/);assert.equal(modelCalls-priorModelCalls,2,'One corrected retry is allowed for candidate language validation');assert.equal(calls.length,priorWrites);
  console.log('PASS delivery on disposable DB: Publish Now → photo post → durable 5-minute source comment → exactly-once comment; spacing/cooldown/credential/missed-schedule gates; live previews; unsupported figures, reversed numeric transitions, unsupported quotes and source conflicts hold before Facebook; matching human approval releases review; non-Bangla analysis retries once and fails without publishing. Facebook and AI were mocked.');
}finally{globalThis.fetch=originalFetch;await closePools();}
