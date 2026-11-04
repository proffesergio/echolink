import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rankNews,publishedAt,generationResult,draftQuality,contentPanel} from '../src/newsroom.mjs';
import {sheetWrites,sheetHeaders,compatibleSheetHeader,sheetRow} from '../src/sheets.mjs';
import {needsReview} from '../src/publishing-policy.mjs';
test('preview always requires review even when live mode or approval-free Pages are used',()=>{
  assert.equal(needsReview({approval:false},{caption_hash:'a',approval_hash:'a'},true),true);
  assert.equal(needsReview({approval:true},{caption_hash:'a',approval_hash:'a'},true),true);
  assert.equal(needsReview({approval:true},{caption_hash:'a',approval_hash:'b'}),true);
  assert.equal(needsReview({approval:true},{caption_hash:'a',approval_hash:'a'}),false);
});
test('today ranking excludes stale, missing and future dates and rewards independent related coverage',()=>{
  const now=new Date('2026-11-03T12:00:00Z'),page={timezone:'Asia/Dhaka'};
  const article=(id,title,hours,publisher)=>({id,title,source_published_at:new Date(now-hours*3600000),publisher,source_url:'https://'+publisher+'/story'});
  const rows=[article('a','বাংলাদেশ শিক্ষা স্বাস্থ্য জরুরি সংবাদ',2,'a.example'),article('b','বাংলাদেশ শিক্ষা স্বাস্থ্য জরুরি সংবাদ প্রকাশ',2,'b.example'),article('c','খেলার মাঠে নতুন রেকর্ড',0,'c.example'),article('stale','বাংলাদেশ শিক্ষা স্বাস্থ্য জরুরি সংবাদ',30,'old.example'),{...article('missing','missing',0,'m.example'),source_published_at:null},article('future','বাংলাদেশ শিক্ষা স্বাস্থ্য জরুরি সংবাদ',-2,'f.example')];
  const ranked=rankNews(rows,page,now);assert.equal(ranked.length,3);assert.equal(ranked[0].id,'a');assert.ok(ranked[0].selection_reason.includes('2 publisher(s)'));
  assert.equal(publishedAt({pubDate:'invalid'},now),null);assert.equal(publishedAt({pubDate:'2026-11-04'},now),null);
});
test('editorial response exposes caption, analysis and image suggestion without claiming generated media',()=>{
  const result=generationResult('```json\n'+JSON.stringify({caption:'একটি নতুন শিরোনাম',analysis:'উৎস যাচাই করুন',image_prompt:'Editorial illustration'})+'\n```');
  assert.equal(result.caption,'একটি নতুন শিরোনাম');assert.ok(result.analysis);assert.ok(result.image_prompt);
  assert.ok(generationResult('Plain caption',{title:'A story'}).image_prompt.includes('illustration'));
  assert.throws(()=>generationResult('{"analysis":"no caption"}'));
  assert.throws(()=>generationResult('{"caption":"truncated'));
  assert.ok(draftQuality({caption:'Only a headline'},{language:'Bangla'}));
  assert.equal(draftQuality({caption:'বাংলাদেশের সংবাদ সম্পর্কে যাচাই করা তথ্য নিয়ে এই প্রতিবেদন। '.repeat(5)},{language:'Bangla'}),null);
  assert.ok(generationResult(JSON.stringify({caption:'Caption',image_prompt:'Dramatic photo with injured students'}),{title:'News'}).image_prompt.startsWith('Editorial illustration'));
});
test('draft, scheduled and published panels reflect real underlying state',()=>{
  assert.equal(contentPanel({status:'Pending Approval',caption:'x'}),'Drafts');assert.equal(contentPanel({status:'Dry Run',caption:'x'}),'Drafts');
  assert.equal(contentPanel({status:'Approved',scheduled_at:'2027-01-01'}),'Scheduled');assert.equal(contentPanel({status:'Posted'}),'Published');assert.equal(contentPanel({status:'Queued'}),'News inbox');
});
test('Sheets upserts keep the existing article row and add new IDs without formula interpretation',()=>{
  const row=id=>({id,page_id:'page',status:'Pending Approval',caption:'=IMPORTXML("bad")',title:'News',updated_at:new Date('2026-11-03')});
  const writes=sheetWrites([sheetHeaders,['one'],['two']],[row('two'),row('new'),row('one')],"Page's posts");
  assert.deepEqual(writes.map(w=>w.range),["'Page''s posts'!A3:U3","'Page''s posts'!A4:U4","'Page''s posts'!A2:U2"]);
  assert.equal(writes[0].values[0][7],'=IMPORTXML("bad")'); // Written with valueInputOption RAW.
  assert.throws(()=>sheetWrites([sheetHeaders,['one'],['one']],[row('one')],'posts'));
  assert.equal(compatibleSheetHeader(sheetHeaders.slice(0,19)),true);
  assert.equal(compatibleSheetHeader(sheetHeaders),true);
  assert.equal(compatibleSheetHeader(['Automation ID','Unrelated data']),false);
  assert.deepEqual(sheetRow({...row('one'),website_url:'https://example.com/news',website_status:'Published'}).slice(19),['https://example.com/news','Published']);
});
