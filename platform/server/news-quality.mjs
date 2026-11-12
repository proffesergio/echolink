import {storyTokens,storySimilarity} from './news-research.mjs';
import {editorialWarnings,sourceNumbers} from './editorial.mjs';
import {captionLanguageWarnings} from './caption-generation.mjs';
import {createHash} from 'node:crypto';
export const reviewedNewsHash=(title,text)=>createHash('sha256').update(title+'\n'+text).digest('hex');
// Temporary brief-report floor for the local 4B worker; never pad scarce evidence.
export const NEWS_REPORT_LIMITS=Object.freeze({sourceWords:180,reportWords:150,paragraphs:3,briefSourceWords:260});
export const CONTEXT_BRIEF_LIMITS=Object.freeze({version:'context-brief-v1',minWords:80,targetMinWords:100,maxWords:500,sourceWords:100,feedWords:120,paragraphs:2,writerTokens:1400,reviewTokens:256,contextTokens:4096});
export function briefEvidence(facts){
 let words=0;const selected=new Set();
 for(const fact of facts){if(words>=NEWS_REPORT_LIMITS.briefSourceWords)break;selected.add(fact.id);words+=newsWords(fact.text);}
 // Do not shorten away a denial, allegation, caveat or contrasting outcome.
 for(const fact of facts)if(/অভিযোগ|অভিযুক্ত|দাবি|অস্বীকার|নাকচ|সম্ভাবনা|হতে পারে|তবে|কিন্তু|যদিও|হয়নি|হয়নি|করেননি|করেনি|পারেননি|পারেনি|did not|denied|alleged|however/iu.test(fact.text))selected.add(fact.id);
 return facts.filter(f=>selected.has(f.id));
}
export function newsReportProblem(post,page,{social=true}={}){
 if(post.type!=='news'||page.creative_policy?.contentFormat!=='news_desk_v3')return null;
 const article=post.seo?.article;
 if(article?.generationVersion!=='newsroom-v4')return 'Regenerate this story with the complete evidence-reviewed newsroom before publication.';
 if(article.briefMode===CONTEXT_BRIEF_LIMITS.version){
  const review=article.briefReview,words=newsWords(article.text);
  if(article.needsReview||words<CONTEXT_BRIEF_LIMITS.minWords||words>CONTEXT_BRIEF_LIMITS.maxWords||String(article.text||'').split(/\n\s*\n/).filter(Boolean).length<CONTEXT_BRIEF_LIMITS.paragraphs||review?.supported!==true||review.contextComplete!==true||review.conflictsResolved!==true||!Array.isArray(review.issues)||review.issues.length||article.reviewedSections!==1)return 'The brief has not passed its factual and context-completeness review.';
 }else if(article.needsReview||newsWords(article.text)<NEWS_REPORT_LIMITS.reportWords||String(article.text||'').split(/\n\s*\n/).filter(Boolean).length<NEWS_REPORT_LIMITS.paragraphs||!(article.evidenceCoverage>=.9)||!article.reviewedSections)return 'The full report has not passed the newsroom completeness and evidence checks.';
 if(article.reviewedTextHash!==reviewedNewsHash(post.title,article.text))return 'The report changed after its evidence review. Regenerate or recheck it before publication.';
 if(social&&article.socialPending)return 'The website report must be confirmed before preparing Facebook copy and design.';
 return null;
}
export const newsWords=text=>String(text||'').trim().split(/\s+/u).filter(Boolean).length;
const sentenceSegmenter=new Intl.Segmenter('bn',{granularity:'sentence'});
export const newsSentences=text=>String(text||'').split(/\n+/).flatMap(p=>[...sentenceSegmenter.segment(p)].map(s=>s.segment.trim())).filter(s=>s.length>8);
const normalized=text=>String(text||'').normalize('NFC').replace(/\s+/g,' ').trim();
export function evidenceLedger(post){
 const sources=[{title:post.title,text:post.body,url:post.source_url},...(post.seo?.reportEvidence?.sources||[]).filter(s=>s.url!==post.source_url&&storySimilarity(post.title,s.title)>=.3)],seen=new Set(),facts=[];
 sources.forEach((source,index)=>{for(const sentence of newsSentences(source.text)){
  const key=normalized(sentence);if(seen.has(key))continue;seen.add(key);
  // Oversize unbroken extracts need a better extractor; never cut a fact midway.
  if(sentence.length>1800)continue;
  facts.push({id:'F'+(facts.length+1),source:index,text:sentence});
 }});
 return facts;
}
export function reportGroups(facts,{budget=1300}={}){
 const groups=[];let group=[],size=0;
 for(const fact of facts){if(group.length&&(size+fact.text.length>budget||group.length>=8)){groups.push(group);group=[];size=0;}group.push(fact);size+=fact.text.length;}
 if(group.length)groups.push(group);return groups;
}
export function evidenceConflicts(facts){
 const conflicts=[];
 for(let i=0;i<facts.length;i++)for(let j=0;j<i;j++){
  const a=facts[i],b=facts[j];if(a.source===b.source||storySimilarity(a.text,b.text)<.75)continue;
  const polarity=s=>/হয়নি|হয়নি|পাননি|করেননি|নয়|নয়|did not|not guilty/iu.test(s);
  // Comparing every number in two related sentences mistook extra dates or
  // contextual scores for contradictions. Compare quantities with the same unit.
  const quantities=s=>{const values=new Map();for(const m of s.matchAll(/((?:[০-৯\d]+(?:[.,][০-৯\d]+)*|এক|দুই|তিন|চার|পাঁচ|ছয়|ছয়|সাত|আট|নয়|নয়|দশ))\s*(জন|সদস্য|রান|ওভার|উইকেট|টাকা|শতাংশ|নিহত|আহত)/gu)){const key=m[2],value=sourceNumbers(m[1]).join(',');if(!values.has(key))values.set(key,new Set());values.get(key).add(value);}return values;};
  const aq=quantities(a.text),bq=quantities(b.text);
  const changedQuantity=[...aq].some(([unit,values])=>bq.has(unit)&&![...values].some(n=>bq.get(unit).has(n)));
  const numbers=s=>[...new Set(sourceNumbers(s))].sort().join(',');
  const sameClaim=s=>s.replace(/[০-৯\d]+(?:[.,][০-৯\d]+)*/gu,'NUMBER').replace(/\s+/g,' ').trim();
  if(changedQuantity||polarity(a.text)!==polarity(b.text)||sameClaim(a.text)===sameClaim(b.text)&&numbers(a.text)!==numbers(b.text))conflicts.push([a.id,b.id]);
 }
 return conflicts;
}
export function sectionWarnings(text,group,page,prior=[]){
 const facts={text:group.map(f=>f.text).join('\n')},warnings=[...editorialWarnings(text,facts,page.niche),...captionLanguageWarnings(text,page)];
 if(/অভিযোগ|অভিযুক্ত|দাবি/u.test(facts.text)&&!/অভিযোগ|অভিযুক্ত|দাবি|বলেন|মতে|জানান|জানিয়েছেন|জানিয়েছেন|জানিয়েছে|জানিয়েছে|ভাষ্য|অনুযায়ী|অনুযায়ী|প্রতিবেদনে|সূত্রে/u.test(text))warnings.push('Source qualification: an allegation or claim lost its attribution.');
 if(/অস্বীকার|নাকচ/u.test(facts.text)&&!/অস্বীকার|নাকচ/u.test(text))warnings.push('Source qualification: an explicit denial was omitted from its assigned evidence.');
 const ordinals=[['প্রথম'],['দ্বিতীয়','দ্বিতীয়'],['তৃতীয়','তৃতীয়'],['চতুর্থ'],['পঞ্চম'],['ষষ্ঠ'],['সপ্তম'],['অষ্টম'],['নবম'],['দশম']];
 const knownNumbers=new Set(sourceNumbers(facts.text));ordinals.forEach((aliases,index)=>{if(aliases.some(w=>text.includes(w))&&!aliases.some(w=>facts.text.includes(w))&&!knownNumbers.has(String(index+1)))warnings.push('Check numbers: an unsupported or changed ordinal was introduced: '+aliases[0]+'.');});
 const latin=s=>s.replace(/[০-৯]/g,c=>'০১২৩৪৫৬৭৮৯'.indexOf(c)),units=s=>[...latin(s).matchAll(/(\d+(?:[.,]\d+)*)\s*(রান|ওভার|উইকেট|জন|টাকা|শতাংশ)/gu)].map(m=>m[1]+':'+m[2]),knownUnits=new Set(units(facts.text));
 if(units(text).some(pair=>!knownUnits.has(pair)))warnings.push('Check numbers: a quantity was attached to an unsupported unit or event detail.');
 if(!/[।!?][”’"']?$/.test(text.trim()))warnings.push('Content format: unfinished report paragraph or clipped sentence.');
 if(newsWords(text)<25)warnings.push('Website article depth: this evidence section became a headline-only summary.');
 const copied=group.filter(f=>newsWords(f.text)>=10&&normalized(text).includes(normalized(f.text))).reduce((n,f)=>n+newsWords(f.text),0);
 if(copied/Math.max(1,newsWords(text))>.4)warnings.push('Content format: too much unquoted source wording remains in this section. Rewrite its sentence structure in original Bengali.');
 if(/[{}\[\]]|\[Part|\bF\d+\b|^---|^#{1,4}|প্রতিবেদনটি.*(?:লিখ|তৈরি)|এই প্রতিবেদনে আমরা/m.test(text))warnings.push('Content format: internal drafting instructions or evidence IDs leaked into the article.');
 for(const quote of text.matchAll(/[“"]([^”"\n]{12,})[”"]/gu))if(!normalized(facts.text).includes(normalized(quote[1])))warnings.push('Source qualification: a direct quotation is not verbatim in its assigned evidence.');
 const sentences=newsSentences(text),previous=prior.flatMap(newsSentences);
 const sameQuantities=(a,b)=>[...new Set(sourceNumbers(a))].sort().join(',')===[...new Set(sourceNumbers(b))].sort().join(',');
 if(sentences.some((s,i)=>[...previous,...sentences.slice(0,i)].some(p=>sameQuantities(s,p)&&storySimilarity(s,p)>.88)))warnings.push('Content format: repeated reporting adds length without new information.');
 const tokens=storyTokens(facts.text),matches=[...storyTokens(text)].filter(t=>tokens.has(t));if(matches.length<Math.min(5,tokens.size))warnings.push('Source qualification: paragraph lost its source topic or named details.');
 return [...new Set(warnings)];
}
export function factModalityWarnings(source,rewrite){
 const warnings=[];
 if(/নজরে এসেছে/u.test(source)&&/নজরে আসেনি/u.test(rewrite)&&!/নজরে আসেনি/u.test(source))warnings.push('Source qualification: preserve that the matter came to the authority’s attention; do not turn it into a denial of awareness.');
 if(/চেষ্টা.{0,25}(?:করেননি|করেনি|করা হয়নি|করা হয়নি)/u.test(source)&&(!/চেষ্টা|প্রচেষ্টা|উদ্যোগ/u.test(rewrite)||!/করেননি|করেনি|নেননি|নেয়নি|নেয়নি|হয়নি|হয়নি|নাই|(?:^|\s)না(?:[।\s]|$)/u.test(rewrite)))warnings.push('Source qualification: preserve did-not-attempt; it must not become tried-and-failed.');
 if(/সম্ভাবনা|হতে পারে|হতে পারত/u.test(source)&&!/সম্ভাবনা|সুযোগ|পারত|পারে/u.test(rewrite))warnings.push('Source qualification: a possibility must not become a confirmed outcome.');
 if(/অস্বীকার|নাকচ/u.test(source)&&!/অস্বীকার|নাকচ/u.test(rewrite))warnings.push('Source qualification: preserve this speaker’s explicit denial.');
 return warnings;
}
export function reportQuality({title,text,facts,sections,page,minWords=NEWS_REPORT_LIMITS.reportWords,minParagraphs=NEWS_REPORT_LIMITS.paragraphs,maxWords=Infinity,requireCoverage=true}){
 const paragraphs=text.split(/\n\s*\n/).filter(Boolean),wordCount=newsWords(text),sourceText=facts.map(f=>f.text).join('\n'),warnings=[...editorialWarnings(title+'\n'+text,{text:sourceText,title},page.niche),...captionLanguageWarnings(text,page)];
 if(wordCount<minWords)warnings.push('Website article depth needs review: complete reporting requires at least '+minWords+' supported words; produced '+wordCount+'.');
 if(wordCount>maxWords)warnings.push('Website article depth needs review: this brief must use at most '+maxWords+' supported words; produced '+wordCount+'.');
 if(paragraphs.length<minParagraphs)warnings.push('Website article depth needs review: expected at least '+minParagraphs+' complete newspaper paragraphs.');
 const covered=new Set(sections.flatMap(s=>s.evidenceIds||[])),coverage=facts.length?facts.filter(f=>covered.has(f.id)).length/facts.length:0;
 const unquoted=value=>normalized(value.replace(/[“"‘'][^”"’'\n]+[”"’']/gu,'')),publicProse=unquoted(text),copiedWords=facts.map(f=>unquoted(f.text)).filter(prose=>newsWords(prose)>=10&&publicProse.includes(prose)).reduce((n,prose)=>n+newsWords(prose),0),verbatimRatio=copiedWords/Math.max(1,wordCount);
 if(verbatimRatio>.4)warnings.push('Content format: too much unquoted source wording remains in the complete report. Rewrite the prose before publication.');
 if(requireCoverage&&coverage<.9)warnings.push('Source qualification: important evidence sections were omitted from the report.');
 if(wordCount>newsWords(sourceText)*1.65)warnings.push('Website article depth needs review: expansion exceeds the available source reporting.');
 if(sections.some(s=>s.review?.supported!==true))warnings.push('Source qualification: every report section needs an independent evidence review.');
 const countries=[['বাংলাদেশ'],['ভারত'],['পাকিস্তান'],['জাপান'],['চীন'],['নেপাল'],['ভুটান'],['আফগানিস্তান'],['ইংল্যান্ড'],['অস্ট্রেলিয়া','অস্ট্রেলিয়া'],['নিউজিল্যান্ড'],['ওয়েস্ট ইন্ডিজ','ওয়েস্ট ইন্ডিজ'],['শ্রীলঙ্কা'],['দক্ষিণ আফ্রিকা'],['যুক্তরাষ্ট্র','আমেরিকা'],['যুক্তরাজ্য'],['ইরান'],['ইরাক'],['ইসরায়েল','ইসরায়েল'],['ফিলিস্তিন'],['রাশিয়া','রাশিয়া'],['ইউক্রেন']];
 for(const aliases of countries)if(aliases.some(n=>text.includes(n))&&!aliases.some(n=>(sourceText+' '+title).includes(n)))warnings.push('Source qualification: a country absent from the reporting was introduced: '+aliases[0]+'.');
 if(/(?:চরম|বিস্ফোরক|তুলকালাম|রণক্ষেত্র|অন্ধভক্ত|দাবানলের মতো|সচেতন মহল)/u.test(title+' '+text))warnings.push('Source qualification: loaded or vague editorial language needs neutral rewriting.');
 return {wordCount,paragraphCount:paragraphs.length,evidenceCoverage:coverage,verbatimRatio,warnings:[...new Set(warnings)]};
}
