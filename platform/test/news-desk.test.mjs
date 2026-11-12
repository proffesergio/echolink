import test from 'node:test';
import assert from 'node:assert/strict';
import {newsSocialCaption,NEWS_COMMENT_CTA} from '../server/news-desk.mjs';
import {generateSectionedNewsReport as generateNewsReport} from '../server/news-report-writer.mjs';
import {parseSectionReview,parseWrittenFacts} from '../server/news-report-writer.mjs';
import {reportQuality,evidenceConflicts,briefEvidence} from '../server/news-quality.mjs';
import {factModalityWarnings} from '../server/news-quality.mjs';
import {evidenceLedger,reportGroups,newsWords,sectionWarnings,newsReportProblem,reviewedNewsHash} from '../server/news-quality.mjs';
import {captionLanguageWarnings} from '../server/caption-generation.mjs';
const page={name:'Noble Seek',kind:'news',language:'Bangla',niche:'News',website_publishing:true,creative_policy:{contentFormat:'news_desk_v3',linkComments:{enabled:true}}};
const nouns='সড়ক বিদ্যালয় হাসপাতাল পাঠাগার বাজার নদী উদ্যান সেতু বাস টার্মিনাল কৃষি বন পানি বিদ্যুৎ খাল বন্দর গবেষণা শিল্প ক্রীড়া শিক্ষা স্বাস্থ্য প্রশিক্ষণ পরিবহন'.split(' ');
// Synthetic fixtures are never sent to a publisher.
const post={type:'news',title:'নগর উন্নয়ন পরিকল্পনা প্রকাশ',source_url:'https://example.com/report',seo:{},body:nouns.map((n,i)=>n+' বিষয়ে কর্তৃপক্ষ '+(i+21)+' সদস্যের দলের নির্দিষ্ট কার্যক্রম প্রকাশ করেছে এবং প্রকল্পের নথিতে '+n+' সংক্রান্ত দায়িত্ব পালনের পরিকল্পনা ও সংশ্লিষ্ট এলাকার প্রয়োজনীয় প্রস্তুতির বিস্তারিত বিবরণ জানিয়েছে।').join('\n\n')};
const connection={provider:'ollama',config:{model:'fixture',contextTokens:4096}};
const groupFrom=prompt=>JSON.parse(prompt.match(/Assigned evidence: (.*?)\nOriginal source lead/s)[1]);
async function complete(_c,_s,prompt,{purpose}){
 if(purpose==='news_review'){const data=JSON.parse(prompt.slice(prompt.indexOf('\n{')+1));return JSON.stringify({supported:true,coveredIds:data.evidence.map(f=>f.id),issues:[]});}
 assert(purpose==='news_article','Facebook caption must wait for website confirmation');assert(prompt.length<3200);
 const group=groupFrom(prompt),texts=group.map(f=>f.text.replace('বিষয়ে কর্তৃপক্ষ','নিয়ে সংশ্লিষ্ট কর্তৃপক্ষ').replace('নির্দিষ্ট কার্যক্রম','নির্ধারিত কার্যক্রম').replace('প্রকল্পের নথিতে','প্রকাশিত নথিতে').replace('দায়িত্ব পালনের পরিকল্পনা','দায়িত্ব বাস্তবায়নের পরিকল্পনা').replace('বিস্তারিত বিবরণ জানিয়েছে','বিস্তারিত তথ্য দিয়েছে'));return JSON.stringify({sentences:group.map((f,i)=>({id:f.id,text:texts[i]}))});
}
test('news captions contain a first-comment invitation and three hashtags',()=>{const caption=newsSocialCaption('পরিকল্পনার বিষয়ে নির্দেশনা এসেছে। #ঢাকা',page);assert(caption.includes(NEWS_COMMENT_CTA));assert.equal((caption.match(/#/g)||[]).length,3);});
test('captions drop forced engagement questions and keep final hashtags',()=>{const caption=newsSocialCaption('পরিকল্পনার বিষয়ে নির্দেশনা এসেছে। আপনার মত কী? #ঢাকা',page);assert(!caption.includes('?'));assert.equal((caption.match(/#/g)||[]).length,3);assert.match(caption,/\n\n(?:#[\p{L}\p{M}\p{N}_]+\s*){3}$/u);});
test('additional context numbers do not create a quantity conflict',()=>{
 assert.deepEqual(evidenceConflicts([{id:'F1',source:0,text:'নগরের নতুন প্রকল্পে কাজের দায়িত্বে ৫ জন কর্মকর্তাকে নিয়োগ দিয়েছে কর্তৃপক্ষ।'},{id:'F2',source:1,text:'নগরের নতুন প্রকল্পে কাজের দায়িত্বে ৫ জন কর্মকর্তাকে ২০২৬ সালে নিয়োগ দিয়েছে কর্তৃপক্ষ।'}]),[]);
});
test('brief selection keeps later denials and caveats and section copying triggers repair',()=>{
 const facts=evidenceLedger(post),denial={id:'F999',source:0,text:'তবে সংশ্লিষ্ট কর্মকর্তা অভিযোগটি অস্বীকার করেছেন।'},selected=briefEvidence([...facts,denial]);
 assert(selected.length<facts.length);assert(selected.includes(denial));
 assert(sectionWarnings(facts[0].text,[facts[0]],page).some(w=>w.includes('unquoted source wording')));
});
test('brief reports below the old 450 word floor can pass writing and publishing',async()=>{
 const brief={...post,body:post.body.split('\n\n').slice(0,8).join('\n\n')};
 const result=await generateNewsReport({page,post:brief,connection},{complete});assert(!result.hold);assert(!result.article.needsReview);assert(result.article.wordCount>=150&&result.article.wordCount<450);
 assert.equal(newsReportProblem({...brief,title:result.title,seo:{article:{...result.article,socialPending:false}}},page),null);
});
test('a long RSS-only dossier cannot pass the lower brief floor',async()=>{
 const rss={...post,seo:{reportEvidence:{sources:[{url:post.source_url,text:post.body,extraction:'feed_only'}]}}};
 const result=await generateNewsReport({page,post:rss,connection},{complete:()=>{throw Error('must not infer');}});assert(result.hold);assert.match(result.message,/extracted full article/);
});
test('complete evidence, independent review and checkpoints precede any social caption',async()=>{
 let saved,writes=0;await assert.rejects(()=>generateNewsReport({page,post,connection},{complete:async(...args)=>{if(args[3].purpose==='news_article'&&++writes===2)throw Error('timeout');return complete(...args);},onSection:async d=>{saved=structuredClone(d);}}),/timeout/);assert.equal(saved.reportSections.length,1);
 let resumed=0;const result=await generateNewsReport({page,post,connection},{savedDraft:saved,complete:async(...args)=>{if(args[3].purpose==='news_article')resumed++;return complete(...args);}});
 assert.equal(resumed,reportGroups(briefEvidence(evidenceLedger(post)),{budget:Math.floor(4096*.28)}).length-1);assert(result.article.wordCount>=150);assert(result.article.paragraphCount>=3);assert.equal(result.caption,'');assert.equal(result.article.socialPending,true);assert.equal(result.article.generationVersion,'newsroom-v4');assert.equal(result.article.evidenceCoverage,1);assert.deepEqual(result.warnings,[]);
});
test('thin, repeated RSS evidence is held before inference instead of padded',async()=>{const result=await generateNewsReport({page,post:{...post,body:'পরিকল্পনা প্রকাশ করেছে সংশ্লিষ্ট কর্তৃপক্ষ।'.repeat(200)},connection},{complete:async()=>{throw Error('must not run');}});assert(result.hold);assert.match(result.message,/unique source words/);});
test('reviewer cannot approve missing facts, and evidence windows preserve complete sentences',()=>{assert.equal(parseSectionReview('{"supported":true,"issues":[],"coveredIds":[]}',[{id:'F1'}]).supported,false);const facts=evidenceLedger(post),groups=reportGroups(facts,{budget:700});assert.equal(groups.flat().length,facts.length);assert(groups.flat().every(f=>f.text.endsWith('।')));assert(newsWords(facts.map(f=>f.text).join(' '))>=450);});
test('unfinished paragraphs fail checks without forcing factual statements to change meaning',()=>{const group=evidenceLedger(post).slice(0,1);assert(sectionWarnings('এখানে ৯৯৯ জনের বিষয়ে বলা হয়েছে কিন্তু এই বাক্যটি',group,page).some(w=>w.includes('unfinished')));});
test('corrupted Hangul words and dropped denials cannot pass Bengali newsroom checks',()=>{assert(captionLanguageWarnings('বাংলাদেশের ও윅েস্ট ইন্ডিজের ম্যাচের তথ্য।',page).length);assert(sectionWarnings('এই ঘটনার বিষয়ে সংশ্লিষ্ট ব্যক্তির বক্তব্য নিয়ে বিস্তারিত আলোচনা করা হয়েছে।',[{id:'F1',text:'তিনি অভিযোগটি অস্বীকার করেছেন।'}],page).some(w=>w.includes('denial')));});
test('ordinal reversals are caught even when written as Bengali words',()=>{assert(sectionWarnings('খেলার চতুর্থ দিনে দলটি মাঠে নামে এবং খেলা শেষে সংশ্লিষ্ট বিষয়ে বিস্তারিত তথ্য প্রকাশ করে।',[{id:'F1',text:'খেলার পঞ্চম দিনে দলটি মাঠে নামে।'}],page).some(w=>w.includes('ordinal')));});
test('not attempting cannot be rewritten as attempting unsuccessfully, and possibility is not an outcome',()=>{assert(factModalityWarnings('তবে সে চেষ্টা করেননি স্বাগতিকরা।','স্বাগতিকরা লক্ষ্যে পৌঁছাতে পারেননি।').length);assert.equal(factModalityWarnings('তবে সে চেষ্টা করেননি স্বাগতিকরা।','কিন্তু স্বাগতিকরা সে চেষ্টা করেননি।').length,0);assert(factModalityWarnings('জয়ের সম্ভাবনা ছিল।','দলটি জয়ী হয়েছে।').length);});
test('rewritten sections cannot omit IDs, swap numeric units or conceal source conflicts',()=>{
 assert.throws(()=>parseWrittenFacts('{"sentences":[{"id":"F1","text":"সম্পূর্ণ বাক্যের বিবরণ।"}]}',[{id:'F1'},{id:'F2'}]),/Every assigned/);
 assert(sectionWarnings('দলটি ৮০ রান করে এবং তাদের জন্য ৩৬৯ ওভারের পরিকল্পনা ছিল বলে বিস্তারিত প্রতিবেদনে বলা হয়েছে।',[{id:'F1',text:'৮০ ওভারে ৩৬৯ রান করতে হতো।'}],page).some(w=>w.includes('unit')));
 assert(evidenceConflicts([{id:'F1',source:0,text:'নগরের নতুন প্রকল্পে কাজের দায়িত্বে ৫ জন কর্মকর্তাকে নিয়োগ দিয়েছে কর্তৃপক্ষ।'},{id:'F2',source:1,text:'নগরের নতুন প্রকল্পে কাজের দায়িত্বে ৬ জন কর্মকর্তাকে নিয়োগ দিয়েছে কর্তৃপক্ষ।'}]).length);
});
test('an old generated headline never becomes newsroom source evidence',async()=>{let story;await assert.rejects(()=>generateNewsReport({page,post:{...post,title:'CORRUPTED GENERATED TITLE',seo:{research:{sources:[{url:post.source_url,title:'মূল প্রতিবেদনের শিরোনাম'}]}}},connection},{complete:async(_c,_s,p)=>{story=p;throw Error('inspected');}}),/inspected/);assert(story.includes('মূল প্রতিবেদনের শিরোনাম'));assert(!story.includes('CORRUPTED'));
});
test('caption-length and caption-format instructions do not contaminate website writing',async()=>{let prompt;const configured={...page,creative_policy:{...page.creative_policy,postTypePrompts:{news:{caption:'CAPTION_ONLY_RULE'}},editorial:{styleNotes:'SHORT_CAPTION_RULE',articleStyleNotes:'NEWSPAPER_VOICE'}}};await assert.rejects(()=>generateNewsReport({page:configured,post,connection},{complete:async(_c,_s,p)=>{prompt=p;throw Error('inspected');}}),/inspected/);assert(prompt.includes('NEWSPAPER_VOICE'));assert(!prompt.includes('CAPTION_ONLY_RULE'));assert(!prompt.includes('SHORT_CAPTION_RULE'));});
test('publishing refuses legacy, pending or changed report text',()=>{const text=post.body+'\n\n',article={generationVersion:'newsroom-v4',text,reviewedSections:6,evidenceCoverage:1,needsReview:false,socialPending:false,reviewedTextHash:reviewedNewsHash(post.title,text)},prepared={...post,seo:{article}};assert.equal(newsReportProblem(prepared,page),null);assert.match(newsReportProblem({...prepared,seo:{article:{...article,text:text+'changed'}}},page),/changed/);assert.match(newsReportProblem({...prepared,seo:{article:{...article,socialPending:true}}},page),/website/);assert.match(newsReportProblem({...prepared,seo:{article:{}}},page),/Regenerate/);});

test('originality compares substantial unquoted prose, never an empty quoted sentence',()=>{
 const quoted='“এই এলাকার বাসিন্দারা প্রতিদিন যাতায়াতের জন্য নতুন সেতুর ওপর নির্ভর করেন বলে তিনি জানিয়েছেন।”';
 const text='তিনি এলাকার বাসিন্দাদের নিয়মিত যাতায়াত ও সেতুর প্রয়োজনীয়তার বিষয়টি ব্যাখ্যা করেছেন।';
 const quality=reportQuality({title:'সেতু',text,facts:[{id:'F1',text:quoted}],sections:[{evidenceIds:['F1'],review:{supported:true}}],page,minWords:1});
 assert.equal(quality.verbatimRatio,0);
 const copied=reportQuality({title:'সেতু',text,facts:[{id:'F1',text}],sections:[{evidenceIds:['F1'],review:{supported:true}}],page,minWords:1});
 assert(copied.verbatimRatio>.4);assert(copied.warnings.some(w=>w.includes('unquoted source wording')));
});

test('natural composition uses the Page writing temperature while independent reviews stay deterministic',async()=>{
 const configured={...page,creative_policy:{...page.creative_policy,editorial:{articleWritingMode:'composed',articleTemperature:0.75}}};let writes=0,reviews=0,repaired=false;
 const result=await generateNewsReport({page:configured,post,connection},{complete:async(c,_s,p,{purpose})=>{
  const data=JSON.parse(p.slice(p.indexOf('\n{')+1).split('\nEdit previousDraft')[0]);
  if(purpose==='news_review'){reviews++;assert.equal(c.config.temperature,0);return JSON.stringify({supported:true,coveredIds:data.evidence.map(f=>f.id),issues:[]});}
  writes++;if(data.previousDraft){repaired=true;assert.equal(c.config.temperature,0.3);assert(data.previousDraft.includes('প্রথম দফায়'));}else assert.equal(c.config.temperature,0.75);assert.equal(c.config.maxOutputTokens,2400);
  const texts=data.evidence.map(f=>f.text.replace('বিষয়ে কর্তৃপক্ষ','নিয়ে সংশ্লিষ্ট কর্তৃপক্ষ').replace('নির্দিষ্ট কার্যক্রম','নির্ধারিত কার্যক্রম').replace('প্রকল্পের নথিতে','প্রকাশিত নথিতে').replace('দায়িত্ব পালনের পরিকল্পনা','দায়িত্ব বাস্তবায়নের পরিকল্পনা').replace('বিস্তারিত বিবরণ জানিয়েছে','বিস্তারিত তথ্য দিয়েছে'));const mid=Math.ceil(texts.length/2);
  return JSON.stringify({paragraphs:[(writes===1?'প্রথম দফায় ':'')+texts.slice(0,mid).join(' '),texts.slice(mid).join(' ')],coveredIds:data.evidence.map(f=>f.id)});
 }});assert.equal(writes,reviews+1);assert(repaired);assert.equal(result.article.writingMode,'composed');assert.equal(result.article.writingTemperature,0.75);assert.equal(result.article.needsReview,false);assert.equal(result.caption,'');
});
