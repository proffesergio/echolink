import {createHash} from 'node:crypto';
import {articleDetails} from './catalog.mjs';
import {articleText} from './news-article.mjs';
export const NEWS_COMMENT_CTA='বিস্তারিত জানতে প্রথম কমেন্টে দেওয়া লিংকে সম্পূর্ণ প্রতিবেদন পড়ুন।';
export function newsSocialCaption(raw,page){
 const tags=[...new Set(String(raw||'').match(/#[\p{L}\p{M}\p{N}_]+/gu)||[])].slice(0,3);
 const prose=articleText(raw).replace(/\[Part[^\]]*\]/g,'').split(/(?<=[।!?])\s+|\n+/u).filter(s=>s.trim()&&!/প্রথম কমেন্ট|কমেন্টে.*লিংক|first comment/iu.test(s)).slice(0,2).join(' ').trim();
 const cta=page.website_publishing&&page.creative_policy?.linkComments?.enabled?NEWS_COMMENT_CTA:'';
 for(const tag of ['#'+String(page.name||'সংবাদ').replace(/[^\p{L}\p{M}\p{N}_]/gu,''),'#সংবাদ','#বাংলাসংবাদ'])if(tags.length<3&&!tags.includes(tag))tags.push(tag);
 return [prose,cta,tags.join(' ')].filter(Boolean).join('\n\n');
}
export async function collectReportEvidence(post,{read=articleDetails,additionalSources=[]}={}){
 const candidates=[...(post.seo?.research?.sources||[]),...additionalSources],urls=[...new Set([post.source_url,...candidates.map(s=>s.url)].filter(Boolean))].slice(0,5),signature=createHash('sha256').update('extraction-v4:'+JSON.stringify(urls)).digest('hex');
 if(post.seo?.reportEvidence?.signature===signature&&Date.now()-Date.parse(post.seo.reportEvidence.collectedAt)<6*3600000)return post;
 const sources=[];let body=post.body||'';
 for(const url of urls){const prior=candidates.find(s=>s.url===url);let text=url===post.source_url?body:prior?.excerpt||prior?.body||'',extraction='feed_only';
  try{const report=await read({title:prior?.title||post.title,url,body:text});if(report.extraction&&report.extraction!=='feed_only'||report.body?.length>text.length){text=report.body;extraction=report.extraction||'article_read';}}catch{}
  if(url===post.source_url)body=text;
  sources.push({title:prior?.title||post.title,url,text:String(text).slice(0,24000),extraction});
 }
 return {...post,body,seo:{...post.seo,reportEvidence:{signature,collectedAt:new Date().toISOString(),sources}}};
}
export {generateNewsReport,generateNewsSocial} from './news-report-writer.mjs';
