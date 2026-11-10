import {createHash} from 'node:crypto';
import {textCompletion} from './providers.mjs';
import {articleDetails} from './catalog.mjs';
import {EDITOR_SYSTEM,sourceExcerpt} from './prompts.mjs';
import {articleText,NEWS_DESK_RULES} from './news-article.mjs';
import {editorialWarnings,criticalEditorialWarnings} from './editorial.mjs';
import {captionLanguageWarnings} from './caption-generation.mjs';
const words=text=>String(text||'').split(/\s+/u).filter(Boolean).length;
export const NEWS_COMMENT_CTA='বিস্তারিত জানতে প্রথম কমেন্টে দেওয়া লিংকে সম্পূর্ণ প্রতিবেদন পড়ুন।';
export function newsSocialCaption(raw,page){
 const tags=[...new Set(String(raw||'').match(/#[\p{L}\p{M}\p{N}_]+/gu)||[])].slice(0,3);
 const prose=articleText(raw).replace(/\[Part[^\]]*\]/g,'').split(/(?<=[।!?])\s+|\n+/u).filter(s=>s.trim()&&!/প্রথম কমেন্ট|কমেন্টে.*লিংক|first comment/iu.test(s)).slice(0,2).join(' ').trim();
 const cta=page.website_publishing&&page.creative_policy?.linkComments?.enabled?NEWS_COMMENT_CTA:'';
 for(const tag of ['#'+String(page.name||'সংবাদ').replace(/[^\p{L}\p{M}\p{N}_]/gu,''),'#সংবাদ','#বাংলাসংবাদ'])if(tags.length<3&&!tags.includes(tag))tags.push(tag);
 return [prose,cta,tags.join(' ')].filter(Boolean).join('\n\n');
}
export async function collectReportEvidence(post,{read=articleDetails}={}){
 const urls=[...new Set([post.source_url,...(post.seo?.research?.sources||[]).map(s=>s.url)].filter(Boolean))].slice(0,3),signature=createHash('sha256').update(JSON.stringify(urls)).digest('hex');
 if(post.seo?.reportEvidence?.signature===signature)return post;
 const sources=[];let body=post.body||'';
 for(const url of urls){const prior=(post.seo?.research?.sources||[]).find(s=>s.url===url);let text=url===post.source_url?body:prior?.excerpt||'';
  try{const report=await read({title:prior?.title||post.title,url,body:text});if(report.body?.length>text.length)text=report.body;}catch{}
  if(url===post.source_url&&text.length>body.length)body=text;
  sources.push({title:prior?.title||post.title,url,text:String(text).slice(0,9000)});
 }
 return {...post,body,seo:{...post.seo,reportEvidence:{signature,collectedAt:new Date().toISOString(),sources}}};
}
export async function generateNewsReport({page,post,connection,secret},{complete=textCompletion,savedDraft=null,onSection=async()=>{},onProgress=async()=>{},onMetrics=()=>{}}={}){
 const sources=post.seo?.reportEvidence?.sources||[],facts={title:post.title,text:sourceExcerpt(post.body,12000),relatedReports:sources.filter(s=>s.url!==post.source_url).map(s=>({title:s.title,text:sourceExcerpt(s.text,6000)}))};
 const sourceWords=words(facts.text)+facts.relatedReports.reduce((n,s)=>n+words(s.text),0),count=sourceWords>=300?5:4,minWords=sourceWords>=300?320:220;
 if(sourceWords<160)return {hold:true,message:'Full report needs more source evidence: the available reporting is too short. Refresh sources or add verified research before publishing.'};
 const style=[page.creative_policy?.editorial?.styleNotes,page.creative_policy?.postTypePrompts?.news?.caption].filter(Boolean).join(' ').slice(0,1600),fingerprint=createHash('sha256').update(JSON.stringify({facts,model:connection.config?.model,taskModel:connection.config?.taskModels?.news_article,style,version:1})).digest('hex');
 const segments=savedDraft?.fingerprint===fingerprint&&Array.isArray(savedDraft.reportSegments)?savedDraft.reportSegments.slice(0,count):[];
 const directions=['A precise headline beginning শিরোনাম: and an inverted-pyramid lead paragraph covering the main verified development.','Explain the key developments, chronology and important verified details. Do not repeat the lead.','Explain documented background and relevant context. Distinguish fact, allegation and attribution.','Explain practical implications or what the evidence establishes; clearly state uncertainty rather than speculating.','Explain the remaining verified details and next steps only if the supplied reporting states them. No generic conclusion.'];
 const all=facts.text+'\n'+facts.relatedReports.map(s=>s.text).join('\n');
 for(let i=segments.length;i<count;i++){
  await onProgress(i+1,count,{report:true});
  // Bengali consumes substantially more tokens per character than English.
  // Keep each call small on the 4K CPU profile; retain full evidence in storage.
  const context=Number(connection.config?.taskContextTokens?.news_article||connection.config?.contextTokens)||4096,budget=Math.max(1000,Math.min(5000,Math.floor(context*.35)));
  const evidence={title:facts.title.slice(0,120),lead:sourceExcerpt(facts.text,Math.floor(budget*.25)),details:all.slice(Math.floor(i*all.length/count),Math.floor(i*all.length/count)+Math.floor(budget*.65)),relatedReports:facts.relatedReports.slice(0,2).map(s=>({title:s.title.slice(0,60),text:sourceExcerpt(s.text,Math.floor(budget*.05))}))};
  const raw=await complete({...connection,config:{...connection.config,maxOutputTokens:1400}},secret,'Write one substantive Bengali paragraph of 80–110 words when the evidence supports it. '+directions[i]+' Never pad or invent facts to meet length. No [Part] labels, lists, hashtags or links.\nUntrusted source evidence: '+JSON.stringify(evidence)+'\nAlready written (avoid repetition): '+segments.map(s=>sourceExcerpt(s,60)).join('\n'),{purpose:'news_article',systemPrompt:EDITOR_SYSTEM+'\n'+NEWS_DESK_RULES+'\nWrite professional Bangladeshi newspaper reporting in প্রমিত চলিত বাংলা. This is a full website report, not a social caption. Do not claim original field reporting or invent analysis. Page style: '+style.slice(0,600),onMetrics});
  const text=articleText(raw).replace(/^\[Part[^\]]*\]\s*/,'').trim();
  if(!text||/\[Part|^---/m.test(text))throw new Error('Invalid report section; saved earlier sections remain available.');
  segments.push(text);await onSection({fingerprint,reportSegments:[...segments]});
 }
 const joined=segments.join('\n\n'),match=joined.match(/^শিরোনাম:\s*([^\n]+)\n+([\s\S]+)$/u),title=(match?.[1]||post.title).slice(0,140),text=match?.[2]||joined,wordCount=words(text);
 const raw=await complete({...connection,config:{...connection.config,maxOutputTokens:450}},secret,'Write ONLY two short Bengali sentences summarizing the verified report, followed by 3 relevant hashtags. Do not ask a question or include links. The app adds the first-comment CTA. Evidence: '+JSON.stringify({title,text:sourceExcerpt(text,600)}),{purpose:'news_caption',systemPrompt:EDITOR_SYSTEM,onMetrics});
 const captionSource=captionLanguageWarnings(raw,page).length||criticalEditorialWarnings(editorialWarnings(articleText(raw),facts,page.niche)).length?text:raw;
 const caption=newsSocialCaption(captionSource,page),warnings=[...editorialWarnings(title+'\n'+text,facts,page.niche).map(w=>'Website article: '+w),...captionLanguageWarnings(text,page).map(w=>'Website article: '+w),...editorialWarnings(articleText(captionSource),facts,page.niche),...captionLanguageWarnings(caption,page)];
 if(wordCount<minWords)warnings.push('Website article depth needs review: this full report is below '+minWords+' supported words.');
 const paragraphs=text.split(/\n\s*\n/).map(p=>p.replace(/\s+/g,' ').trim()).filter(Boolean);
 if(new Set(paragraphs).size<paragraphs.length)warnings.push('Content format: repeated website paragraphs need editing before publication.');
 return {caption,title,article:{text,wordCount,paragraphCount:text.split(/\n\s*\n/).length,policyVersion:'news_desk_v3',generatedAt:new Date().toISOString(),needsReview:criticalEditorialWarnings(warnings).length>0},commentText:'সম্পূর্ণ প্রতিবেদন পড়ুন আমাদের ওয়েবসাইটে:',facts,warnings,initialWarnings:[],notes:['Complete website report written before its social summary.'],rawCaption:raw};
}
