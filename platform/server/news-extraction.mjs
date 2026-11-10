import {load} from 'cheerio';
const plain=value=>String(value||'').replace(/\s+/g,' ').trim();
// Read the article container, never the complete <main> navigation/sidebar text.
export function extractNewsHTML(html){
 const $=load(html),structured=[];
 const walk=value=>{if(Array.isArray(value))return value.forEach(walk);if(!value||typeof value!=='object')return;if(value.articleBody)structured.push({body:String(value.articleBody),publishedAt:value.datePublished});if(value['@graph'])walk(value['@graph']);};
 $('script[type="application/ld+json"]').each((_,el)=>{try{walk(JSON.parse($(el).text()));}catch{}});
 const image=$('meta[property="og:image"]').attr('content')||$('meta[name="twitter:image"]').attr('content'),category=$('meta[property="article:section"]').attr('content'),publishedAt=$('meta[property="article:published_time"]').attr('content');
 $('script,style,nav,footer,aside,form,button,figure,figcaption,.related-posts,.related-news,.related-articles,.share,.social-share,.advertisement,.ads,[class*="recommended"]').remove();
 const candidates=structured.map(s=>({...s,method:'structured_article',body:s.body.split(/\n+/).map(plain).filter(Boolean).join('\n\n')}));
 for(const selector of ['[itemprop="articleBody"]','.article-body','.article-content','.story-content','.entry-content','.news-content','article']){
  $(selector).each((_,el)=>{const root=$(el),paragraphs=root.find('p').toArray().filter(p=>!$(p).closest('aside,nav,header,.related,.related-news').length).map(p=>plain($(p).text())).filter(t=>t.length>=35&&!/^(আরও পড়ুন|আরও পড়ুন|Read more|Advertisement|বিজ্ঞাপন|একাত্তর\/|ঢাকাপোস্ট\/)/i.test(t));
   const body=paragraphs.length>=2?paragraphs.join('\n\n'):selector==='article'?'':plain(root.text());if(body.length>=200)candidates.push({body,method:selector,publishedAt});
  });
  // Prefer explicitly labelled article bodies over the larger article wrapper.
  if(candidates.some(c=>c.body.length>=500))break;
 }
 const chosen=candidates.filter(c=>c.body.length>=200).sort((a,b)=>b.body.length-a.body.length)[0];
 return {body:chosen?.body||'',extraction:chosen?.method||'feed_only',image,category,publishedAt:chosen?.publishedAt||publishedAt};
}
