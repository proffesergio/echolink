import test from 'node:test';
import assert from 'node:assert/strict';
import {generateNewsReport,generateNewsSocial} from '../server/news-report-writer.mjs';
import {prepareBriefEvidence,briefQuality,parseBriefReview,briefWriterSchema,parseBrief,normalizeBriefText} from '../server/news-brief-writer.mjs';
import {newsReportProblem,newsWords,CONTEXT_BRIEF_LIMITS} from '../server/news-quality.mjs';
import {collectReportEvidence} from '../server/news-desk.mjs';
const page={kind:'news',name:'সংবাদ',niche:'News',language:'Bangla',website_publishing:true,creative_policy:{contentFormat:'news_desk_v3',linkComments:{enabled:true}}};
const source=[
 'নগরের নাগরিক সেবার উন্নয়নের জন্য স্থানীয় কর্তৃপক্ষ একটি নতুন পরিকল্পনা প্রকাশ করেছে এবং সংশ্লিষ্ট বিভাগের কর্মকর্তাদের দায়িত্ব নির্ধারণ করেছে।',
 'পরিকল্পনার লক্ষ্য হলো বাসিন্দাদের প্রয়োজন অনুযায়ী সড়ক সংস্কার ও পানি সরবরাহের কাজে সমন্বয় করা এবং নিয়মিত সেবা নিশ্চিত করা।',
 'সংশ্লিষ্ট দপ্তরের কর্মীরা এলাকার প্রয়োজন চিহ্নিত করে তালিকা তৈরি করবেন এবং সেই তালিকা অনুযায়ী কাজের অগ্রাধিকার নির্ধারণ করবেন।',
 'প্রকাশিত নথিতে বিদ্যালয় ও হাসপাতালের আশপাশের যাতায়াত ব্যবস্থা উন্নয়নের বিষয়টিও গুরুত্ব পেয়েছে এবং বিভাগের মধ্যে তথ্য বিনিময়ের কথা বলা হয়েছে।',
 'সেবায় কোনো সমস্যা হলে স্থানীয় বাসিন্দারা সংশ্লিষ্ট দপ্তরে জানাতে পারবেন এবং দায়িত্বপ্রাপ্ত কর্মীরা সেই অভিযোগের বিষয়ে প্রয়োজনীয় তথ্য সংগ্রহ করবেন।',
 'কর্তৃপক্ষ জানিয়েছে যে কাজের অগ্রগতি নিয়মিত পর্যবেক্ষণ করা হবে এবং সংগৃহীত তথ্যের ভিত্তিতে প্রয়োজন অনুযায়ী পরবর্তী কার্যক্রম নির্ধারণ করা হবে।',
 'দপ্তরগুলোর কার্যক্রমের সমন্বয় এবং নাগরিকদের প্রয়োজন বোঝার জন্য সংশ্লিষ্ট কর্মীদের মধ্যে যোগাযোগ রাখার নির্দেশনাও প্রকাশিত নথিতে উল্লেখ করা হয়েছে।',
 'নতুন পরিকল্পনার বিস্তারিত প্রকাশ করে স্থানীয় কর্তৃপক্ষ নাগরিক সেবার দায়িত্বে থাকা বিভাগগুলোর নির্ধারিত কাজ সম্পর্কে সংশ্লিষ্ট কর্মীদের অবহিত করেছে।'
].join('\n\n');
const paragraphs=[
 'নাগরিকদের প্রয়োজনকে গুরুত্ব দিয়ে সেবাদানকারী বিভাগগুলোর কাজ সমন্বয়ের পরিকল্পনা জানিয়েছে নগর কর্তৃপক্ষ। এর আওতায় সড়ক ও পানির ব্যবস্থাপনায় সংশ্লিষ্ট কর্মীদের দায়িত্ব ভাগ করা হয়েছে। এলাকার প্রয়োজন যাচাই করে তাঁরা কাজের তালিকা করবেন। এরপর অগ্রাধিকার অনুসারে কার্যক্রম চলবে। বিদ্যালয় ও হাসপাতালের কাছে যাতায়াতের সুবিধা বাড়ানোর বিষয়েও নথিতে গুরুত্ব দেওয়া হয়েছে।',
 'স্থানীয় বাসিন্দাদের কোনো সেবায় সমস্যা হলে তা দায়িত্বপ্রাপ্ত দপ্তরকে জানাতে বলা হয়েছে। কর্মীরা সমস্যার তথ্য সংগ্রহের পাশাপাশি বিভাগগুলোর মধ্যে যোগাযোগ রাখবেন। কর্তৃপক্ষের ভাষ্য অনুযায়ী, নিয়মিত অগ্রগতি পর্যবেক্ষণের মাধ্যমে পরবর্তী কাজ নির্ধারণ করা হবে। প্রয়োজনের ভিত্তিতে কার্যক্রম পরিচালনার জন্য সংশ্লিষ্ট বিভাগের কর্মীদের মধ্যে তথ্য আদানপ্রদান এবং নাগরিকদের সমস্যার খবর রাখার ওপরও পরিকল্পনায় জোর দেওয়া হয়েছে।'
];
const post={type:'news',title:'নগরে নাগরিক সেবা সমন্বয়ের পরিকল্পনা',body:source,source_url:'https://example.com/news',seo:{reportEvidence:{sources:[{url:'https://example.com/news',title:'নগরে নাগরিক সেবা সমন্বয়ের পরিকল্পনা',text:source,extraction:'article'}]}}};
const connection={provider:'ollama',config:{model:'fixture'}};
const accepted=JSON.stringify({supported:true,contextComplete:true,conflictsResolved:true,issues:[]});
const write=JSON.stringify({paragraphs});
test('double-escaped paragraph breaks and a repeated source headline are normalized before review',()=>{
 const text=post.title+'\\n\\n'+paragraphs.join('\\n\\n');const result=parseBrief(JSON.stringify({text}),{title:post.title});assert(!result.includes('\\n'));assert(!result.startsWith(post.title));assert.equal(newsWords(result),newsWords(paragraphs.join(' ')));assert.equal(normalizeBriefText(paragraphs.join('\n\n')),paragraphs.join('\n\n'));
});
test('a claim that the ministry was unaware cannot replace the source statement that it noticed the misinformation',()=>{
 const d={canonicalTitle:'মন্ত্রণালয়ের বিজ্ঞপ্তি',evidence:[{id:'F1',source:0,text:'বিষয়টি কৃষি মন্ত্রণালয়ের নজরে এসেছে।'}],sources:[{label:'ইত্তেফাক'}],conflicts:[]};assert(briefQuality('বাতিলের কোনো খবর তাদের নজরে আসেনি।',d,page).warnings.some(w=>w.includes('denial of awareness')));
});
test('compact decoding constrains script/numerals while static checks enforce the80–500-word range',()=>{
 const schema=briefWriterSchema(prepareBriefEvidence(post)),pattern=new RegExp(schema.properties.text.pattern,'u'),text=paragraphs.join(' ');
 assert(!schema.properties.text.pattern.includes('\\s'),'llama.cpp rejects shorthand whitespace and silently drops that pattern');
 assert(!/\{\d+,\d+\}/.test(schema.properties.text.pattern),'native decoding must not expand hundreds of optional words');
 assert(pattern.test(text));assert(pattern.test(text+' '+text));assert(!pattern.test(text.replace('নাগরিকদের','না윅রিকদের')));assert(!pattern.test(text.replace('নাগরিকদের','123 নাগরিকদের')));
 const dossier=prepareBriefEvidence(post);
 assert(briefQuality(Array(6).fill(text).join('\n\n'),dossier,page).warnings.some(w=>w.includes('at most 500')));
 assert(briefQuality('নাগরিকদের সেবা বাড়াতে পরিকল্পনা নেওয়া হয়েছে।',dossier,page).warnings.some(w=>w.includes('at least 80')));
 assert.equal(newsWords(parseBrief(JSON.stringify({text}))),newsWords(text));assert.equal(parseBrief(JSON.stringify({text})).split('\n\n').length,2);
});
test('automatic brief uses one writer and one whole-report reviewer, then passes the publishing gate',async()=>{
 assert(newsWords(paragraphs.join(' '))>=100&&newsWords(paragraphs.join(' '))<=150);
 const purposes=[];
 const result=await generateNewsReport({page,post,connection},{complete:async(c,_s,p,o)=>{purposes.push(o.purpose);assert.equal(c.config.contextTokens,4096);assert(!p.includes('Rewrite EVERY'));assert.equal(c.config.maxOutputTokens,o.purpose==='news_article'?1400:256);assert(o.deadlineMs>0&&o.deadlineMs<=(o.purpose==='news_article'?150000:180000));return o.purpose==='news_article'?write:accepted;}});
 assert(!result.hold,result.message);assert.deepEqual(purposes,['news_article','news_review']);assert.equal(result.article.reviewedSections,1);assert.equal(result.article.briefMode,CONTEXT_BRIEF_LIMITS.version);assert.equal(result.article.paragraphCount,2);assert.equal(result.article.needsReview,false);
 const prepared={...post,title:result.title,seo:{article:result.article}};
 assert.equal(newsReportProblem(prepared,page,{social:false}),null);assert.match(newsReportProblem(prepared,page),/website/);
 const social=await generateNewsSocial({page,post:prepared,connection},{complete:()=>{throw Error('must not infer again');}});assert.equal(social.warnings.length,0);assert.equal((social.caption.match(/#/g)||[]).length,3);
 assert.equal(newsReportProblem({...prepared,seo:{article:{...result.article,socialPending:false}}},page),null);
 assert.match(newsReportProblem({...prepared,seo:{article:{...result.article,briefReview:{supported:true},socialPending:false}}},page),/context/);
 assert.match(newsReportProblem({...prepared,seo:{article:{...result.article,text:result.article.text+' বদল।',socialPending:false}}},page),/changed/);
});
test('a corrupted-script draft is repaired before spending a reviewer call',async()=>{
 let writes=0,reviews=0;
 const result=await generateNewsReport({page,post,connection},{complete:async(_c,_s,p,{purpose})=>{if(purpose==='news_review'){reviews++;return accepted;}writes++;if(writes===1)return JSON.stringify({paragraphs:[paragraphs[0].replace('নাগরিকদের','না윅রিকদের'),paragraphs[1]]});assert(p.includes('corrupted'));return write;}});
 assert(!result.hold,result.message);assert.equal(writes,2);assert.equal(reviews,1);
});

test('repair and review share a finite attempt budget instead of each restarting a long timer',async()=>{
 const originalNow=Date.now;let elapsed=0,writes=0;const start=originalNow();Date.now=()=>start+elapsed;
 try{
  const result=await generateNewsReport({page,post,connection},{complete:async(_c,_s,_p,options)=>{
   if(options.purpose==='news_review'){assert.equal(options.deadlineMs,75000);return accepted;}
   if(++writes===1){elapsed+=140000;return JSON.stringify({paragraphs:[paragraphs[0].replace('নাগরিকদের','না윅রিকদের'),paragraphs[1]]});}
   elapsed+=145000;return write;
  }});assert(!result.hold,result.message);assert.equal(writes,2);
 }finally{Date.now=originalNow;}
});
test('copying source sentences triggers a targeted rewrite, not approval',async()=>{
 let writes=0,reviews=0;
 const result=await generateNewsReport({page,post,connection},{complete:async(_c,_s,p,{purpose})=>{if(purpose==='news_review'){reviews++;return accepted;}writes++;return writes===1?JSON.stringify({paragraphs:[source.split('\n\n').slice(0,3).join(' '),source.split('\n\n').slice(3,6).join(' ')]}):write;}});
 assert(!result.hold,result.message);assert.equal(writes,2);assert.equal(reviews,1);
});
test('a reviewed but context-incomplete summary cannot be automatically approved',async()=>{
 const result=await generateNewsReport({page,post,connection},{complete:async(_c,_s,_p,{purpose})=>purpose==='news_article'?write:JSON.stringify({supported:true,contextComplete:false,conflictsResolved:true,issues:[]})});assert(result.hold);assert.match(result.message,/context/);
 assert.equal(parseBriefReview('{"supported":true}').contextComplete,false);
});
test('a complete brief below the word target is reviewed without padding or a second writer call',async()=>{
 const short=paragraphs[0]+' '+paragraphs[1].split('।').slice(0,3).join('।')+'।';assert(newsWords(short)>=80&&newsWords(short)<100);
 const purposes=[];const result=await generateNewsReport({page,post,connection},{complete:async(_c,_s,_p,{purpose})=>{purposes.push(purpose);return purpose==='news_article'?JSON.stringify({text:short}):accepted;}});
 assert(!result.hold,result.message);assert.deepEqual(purposes,['news_article','news_review']);assert(result.article.wordCount<100);assert.equal(newsReportProblem({...post,title:result.title,seo:{article:{...result.article,socialPending:false}}},page),null);
});
test('a timed-out whole-report review resumes the saved draft without rewriting',async()=>{
 let saved;
 await assert.rejects(()=>generateNewsReport({page,post,connection},{complete:async(_c,_s,_p,{purpose})=>{if(purpose==='news_review')throw Error('timeout');return write;},onSection:async s=>{saved=s;}}),/timeout/);
 const purposes=[];const result=await generateNewsReport({page,post,connection},{savedDraft:saved,complete:async(_c,_s,_p,{purpose})=>{purposes.push(purpose);return accepted;}});assert(!result.hold,result.message);assert.deepEqual(purposes,['news_review']);
});
test('substantive feeds can support a context brief, while short teasers and clipped fragments cannot',()=>{
 const feed={...post,seo:{reportEvidence:{sources:[{url:post.source_url,title:post.title,text:source,extraction:'feed_only'}]}}};
 const dossier=prepareBriefEvidence(feed);assert(!dossier.hold);assert.equal(dossier.sourceKind,'substantive_feed');
 assert(prepareBriefEvidence({...feed,body:'শুধু একটি ছোট খবরের শিরোনাম।',seo:{}}).hold);
 assert(prepareBriefEvidence({...feed,body:('নগরের পরিকল্পনা বিষয়ে '+ 'তথ্য '.repeat(140)),seo:{}}).hold);
 const short=source.split('\n\n').slice(0,6).join('\n\n');assert(newsWords(short)>=100);
 assert(!prepareBriefEvidence({...post,body:short,seo:{reportEvidence:{sources:[{url:post.source_url,title:post.title,text:short,extraction:'article'}]}}}).hold);
});
test('conflicting quantities require named attribution when repeated in a brief',()=>{
 const a={id:'F1',source:0,text:'নগরের প্রকল্পে কাজের জন্য ৫ জন কর্মকর্তাকে দায়িত্ব দিয়েছে কর্তৃপক্ষ।'},b={id:'F2',source:1,text:'নগরের প্রকল্পে কাজের জন্য ৬ জন কর্মকর্তাকে দায়িত্ব দিয়েছে কর্তৃপক্ষ।'};
 const dossier={canonicalTitle:post.title,evidence:[a,b],sources:[{label:'প্রথম আলো'},{label:'বাসস'}],conflicts:[['F1','F2']]};
 assert(briefQuality('প্রকল্পে ৫ জন কর্মকর্তাকে দায়িত্ব দিয়েছে কর্তৃপক্ষ।',dossier,page).warnings.some(w=>w.includes('conflicting quantities')));
 assert(!briefQuality('প্রথম আলোর প্রতিবেদনে প্রকল্পে ৫ জন কর্মকর্তার দায়িত্বের কথা জানানো হয়েছে।',dossier,page).warnings.some(w=>w.includes('conflicting quantities')));
});
test('source collection reads no more than two related articles and reuses newly extracted research',async()=>{
 let calls=0;const sources=Array.from({length:4},(_,i)=>({url:'https://example.com/'+i,title:post.title,excerpt:source,completeBody:true,extraction:'article',fetchedAt:new Date().toISOString()}));
 const result=await collectReportEvidence({...post,source_url:sources[0].url,seo:{research:{sources}}},{read:async()=>{calls++;throw Error('must use fresh research');}});
 assert.equal(calls,0);assert.equal(result.seo.reportEvidence.sources.length,2);
 await collectReportEvidence(result,{read:async()=>{calls++;throw Error('must use cache');}});assert.equal(calls,0);
});
test('a dated event that has ended cannot be auto-published as still ongoing',()=>{
 const text=source+' আয়োজনটি ৬ নভেম্বর শুরু হয়ে ১০ নভেম্বর পর্যন্ত চলবে।',dated={...post,title:'আর্ট ঢাকা ২০২৬',body:text,seo:{reportEvidence:{sources:[{url:post.source_url,title:'আর্ট ঢাকা ২০২৬',text,extraction:'article'}]}}};
 const dossier=prepareBriefEvidence(dated,{now:new Date('2026-11-11T04:00:00Z')});assert.equal(dossier.eventEndedOn,'2026-11-10');
 assert(briefQuality(paragraphs.join('\n\n')+' মেলা চলছে।',dossier,page).warnings.some(w=>w.includes('ended on')));
});
