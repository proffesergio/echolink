import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {contentWorkflow,workflowPostType,workflowDraftPatch,workflowMediaProblem,workflowPublicationProblem} from '../shared/content-workflow.mjs';
import {profileConfigSchema,preparePageProfile} from '../server/profile-config.mjs';
import {continuePipeline,normalizeWorkflowDraft,storyboardSocialCaption} from '../server/jobs.mjs';
import {readyForApproval} from '../server/planner.mjs';
const page=mode=>({id:'page',require_review:true,profile_config:{content_workflow:mode},creative_policy:{nichePreset:'reels_old'}});
const post={id:'post',page_id:'page',status:'review',type:'original',version:4,caption:'A source-supported caption.',creative:{},seo:{editorialWarnings:[]}};
const task={id:'task',workspace_id:'workspace',page_id:'page',post_id:'post',kind:'generate',input:{}};
test('explicit workflow overrides legacy reels; existing personal and Page fallback retain legacy',()=>{
 for(const mode of ['TEXT','PHOTO_CAPTION','VIDEO_REELS'])assert.equal(contentWorkflow(page(mode)),mode);
 assert.equal(contentWorkflow({creative_policy:{nichePreset:'reels_old'}}),'VIDEO_REELS');assert.equal(contentWorkflow({destination_type:'facebook_profile',creative_policy:{nichePreset:'reels_old'}}),'VIDEO_REELS');assert.equal(contentWorkflow({}), 'PHOTO_CAPTION');
 for(const mode of ['TEXT','PHOTO_CAPTION','VIDEO_REELS'])assert(profileConfigSchema.safeParse({content_workflow:mode}).success);
 assert.equal(profileConfigSchema.safeParse({content_workflow:'video'}).success,false);
});
test('draft routes retain factual post kinds outside video and use vertical reels only in video mode',()=>{
 assert.equal(workflowPostType(page('PHOTO_CAPTION')),'image');assert.equal(workflowPostType(page('TEXT')),'original');
 for(const type of ['news','blog','quote','product_sale'])for(const mode of ['PHOTO_CAPTION','TEXT'])assert.equal(workflowPostType(page(mode),{type}),type);
 for(const type of ['original','news','product_sale'])assert.equal(workflowPostType(page('VIDEO_REELS'),{type}),'reel');
});
test('editable reel normalization clears stale video/media/design without deleting factual evidence',async()=>{
 const old={...post,type:'reel',creative:{assetId:'video',sourceImage:'https://example.com/x',mime:'video/mp4'},seo:{article:{text:'facts'},storyboard:[{}],reelMedia:{},mediaCredits:[],designBrief:'old'}};
 for(const mode of ['TEXT','PHOTO_CAPTION']){
  const patch=workflowDraftPatch(page(mode),old);assert.equal(patch.type,mode==='TEXT'?'original':'image');assert.deepEqual(patch.creative,{ratio:'1:1',style:'editorial'});assert.equal(patch.seo.storyboard,undefined);assert.equal(patch.seo.reelMedia,undefined);assert.equal(patch.seo.article.text,'facts');
 }
 const calls=[];const db={query:async(sql,args)=>{calls.push([sql,args]);return sql.startsWith('SELECT')?{rowCount:0,rows:[]}:{rowCount:1,rows:[{...old,...workflowDraftPatch(page('TEXT'),old),version:5,approved_version:null}]};}};
 const normalized=await normalizeWorkflowDraft(db,'workspace',page('TEXT'),old);assert.equal(normalized.version,5);assert.equal(normalized.approved_version,null);assert.match(calls[1][0],/version=version\+1/);assert.match(calls[1][0],/caption=''/);
 await assert.rejects(()=>normalizeWorkflowDraft({query:async()=>({rowCount:1})},'workspace',page('TEXT'),old),e=>e.code==='publication_pending');
 for(const status of ['published','publishing','unknown','scheduled','ready_manual'])assert.equal(workflowDraftPatch(page('TEXT'),{...old,status}),null);
});
test('stale queued media is held; only explicit text-only news-social preparation is allowed in TEXT',()=>{
 assert(workflowMediaProblem(page('TEXT'),post,'creative'));assert(workflowMediaProblem(page('PHOTO_CAPTION'),{...post,type:'reel'},'render_reel'));
 assert.equal(workflowMediaProblem(page('TEXT'),{...post,type:'news'},'creative',{textOnly:true}),null);assert(workflowMediaProblem(page('PHOTO_CAPTION'),{...post,type:'news'},'creative',{textOnly:true}));
 assert.equal(workflowMediaProblem(page('PHOTO_CAPTION'),post,'creative'),null);
});
async function pipeline(mode,{current=post,kind='generate',input={},legacy=false,autoRender=false}={}){
 const events=[],p={...page(mode),creative_policy:{reels:{autoRender}},...(legacy?{profile_config:{}}:{})};
 const db={query:async(sql)=>({rowCount:1,rows:sql.includes('creator.pages')?[p]:sql.includes('creator.posts')?[current]:[]})};
 await continuePipeline({...task,kind,input},{},{transact:async(_w,fn)=>fn(db),capacity:async()=>events.push('capacity'),queue:async(_db,_w,kind,options)=>events.push({kind,...options}),notify:async()=>events.push('notify'),publication:async()=>events.push('publication')});return events;
}
test('photo generation continues to image even for require_review; text goes directly to review',async()=>{
 assert((await pipeline('PHOTO_CAPTION')).some(e=>e.kind==='creative'));
 assert.deepEqual(await pipeline('TEXT'),['notify']);
 assert.deepEqual(await pipeline('TEXT',{kind:'creative'}),[]);
 assert.deepEqual(await pipeline('PHOTO_CAPTION',{kind:'creative'}),['notify']);
 assert.deepEqual(await pipeline('PHOTO_CAPTION',{legacy:true}),['notify']);
});
test('text news keeps website-first social stage but requests no image; video honors explicit autoRender',async()=>{
 const news={...post,type:'news',seo:{article:{text:'facts',socialPending:true}}};
 const events=await pipeline('TEXT',{current:news});assert(events.some(e=>e.kind==='creative'&&e.input.textOnly===true));
 assert.deepEqual(await pipeline('VIDEO_REELS',{current:{...post,type:'reel'},autoRender:false}),['notify']);
 assert((await pipeline('VIDEO_REELS',{current:{...post,type:'reel'},autoRender:true})).some(e=>e.kind==='render_reel'));
 assert.deepEqual(await pipeline('VIDEO_REELS',{current:{...post,type:'reel',seo:{editorialWarnings:['Language policy requires bilingual copy.']}},autoRender:true}),['notify']);
});
test('current workflow gates approval and publication without stale text image requirements',()=>{
 assert.doesNotThrow(()=>readyForApproval({...post,type:'product_sale'},page('TEXT')));
 assert.throws(()=>readyForApproval({...post,creative:{assetId:'old'}},page('TEXT')),e=>e.code==='content_workflow');
 assert(workflowPublicationProblem(page('PHOTO_CAPTION'),post));assert.equal(workflowPublicationProblem(page('PHOTO_CAPTION'),{...post,creative:{assetId:'image'}}),null);
 assert(workflowPublicationProblem(page('VIDEO_REELS'),{...post,type:'reel',creative:{assetId:'image'}}));assert.equal(workflowPublicationProblem(page('VIDEO_REELS'),{...post,type:'reel',creative:{assetId:'video',mime:'video/mp4'}}),null);
});
test('new personal profile defaults photo; migration never rewrites existing profile settings',async()=>{
 const data=preparePageProfile({name:'Other Person',language:'English',kind:'creator',destination_type:'facebook_profile',profile_config:{}},{name:'Other Person'});assert.equal(data.profile_config.content_workflow,'PHOTO_CAPTION');
 const sql=await readFile(new URL('../sql/019-content-workflow.sql',import.meta.url),'utf8');assert.match(sql,/NOT profile_config \? 'content_workflow'/);assert(!/UPDATE creator\.(pages|posts|tasks|publication_deliveries)/u.test(sql));
});

test('bilingual video generates a separate real social caption sequentially while retaining Bengali narration',async()=>{
 const events=[],storyboard=[{voiceover_text_bengali:'বাংলা ভাষায় শেখার সহজ উপায়।'}],p={...page('VIDEO_REELS'),language:'Bilingual-Mix',profile_config:{content_workflow:'VIDEO_REELS',language_mode:'DUAL_BILINGUAL',primary_language:'bn',languages:['en','bn']}};
 events.push('storyboard complete');
 const result=await storyboardSocialCaption({page:p,post,connection:{},secret:{},storyboard},{generateCaption:async(options,{onMetrics})=>{assert.equal(events[0],'storyboard complete');events.push('caption');assert.equal(options.page,p);onMetrics({input:12,output:20});return {caption:'বাংলা ভাষায় শেখার সহজ উপায়।\nThis is a useful lesson.',warnings:[],notes:['Separate caption generated.']};},onMetrics:m=>events.push(m)});
 assert.deepEqual(result.warnings,[]);assert.match(result.caption,/This is a useful lesson/);assert.equal(storyboard[0].voiceover_text_bengali,'বাংলা ভাষায় শেখার সহজ উপায়।');assert(result.notes.some(n=>n.includes('remain Bengali')));assert.equal(events[1],'caption');assert.equal(events[2].input,12);
 const held=await storyboardSocialCaption({page:p,post,storyboard},{generateCaption:async()=>({caption:'বাংলা ভাষায় শেখার সহজ উপায়।',warnings:[],notes:[]})});assert(held.warnings.some(w=>w.startsWith('Language policy')));
});
