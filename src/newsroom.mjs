import {localDay} from './core.mjs';
const stop=new Set(['এই','এক','এবং','থেকে','সঙ্গে','করে','করতে','হবে','নিয়ে','জন্য','পর','আর','কী','কি','না','নতুন','বলেন','the','and','for','with','that']);
export function titleTokens(title){return new Set(String(title).toLowerCase().replace(/[\p{P}\p{S}\p{N}]/gu,' ').split(/\s+/).filter(t=>t.length>2&&!stop.has(t)));}
export function similarity(a,b){const x=titleTokens(a),y=titleTokens(b);if(!x.size||!y.size)return 0;return [...x].filter(t=>y.has(t)).length/Math.max(x.size,y.size);}
export function publishedAt(item,now=new Date()){
  const value=item.isoDate||item.pubDate||item.date;if(!value)return null;
  const date=new Date(value);return Number.isFinite(date.getTime())&&date.getTime()<=now.getTime()+15*60000?date:null;
}
export function rankNews(articles,page,now=new Date()){
  const today=localDay(now,page.timezone);
  const eligible=articles.filter(a=>a.source_published_at&&localDay(new Date(a.source_published_at),page.timezone)===today&&new Date(a.source_published_at).getTime()<=now.getTime()+15*60000);
  return eligible.map(a=>{
    const matching=eligible.filter(b=>similarity(a.title,b.title)>=0.4),publishers=new Set(matching.map(b=>b.publisher||new URL(b.source_url).hostname));
    const ageHours=Math.max(0,(now-new Date(a.source_published_at))/3600000);
    const recency=Math.max(0,30-ageHours),coverage=Math.min(40,(publishers.size-1)*15);
    const impact=/(বাংলাদেশ|জাতীয়|নির্বাচন|সরকার|অর্থনীতি|শিক্ষা|স্বাস্থ্য|আবহাওয়া|দুর্যোগ|বন্যা|ভূমিকম্প|আদালত|জরুরি|দুর্ঘটনা|বিশ্ব|যুদ্ধ)/u.test(a.title)?15:0;
    const score=recency+coverage+impact+(a.image_url?3:0);
    return {...a,selection_score:Math.round(score*100)/100,selection_reason:`Today's feed candidate; ${ageHours.toFixed(1)}h old; ${publishers.size} publisher(s) with related headlines; ${impact?'public-interest topic':'general topic'}${a.image_url?'; source image available':''}. Ranked among enabled feeds, not a verified national trending chart.`};
  }).sort((a,b)=>b.selection_score-a.selection_score||new Date(b.source_published_at)-new Date(a.source_published_at));
}
export function generationResult(text,article={}){
  if(typeof text!=='string'||!text.trim())throw new Error('Empty model output');
  let parsed;const clean=text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');try{parsed=JSON.parse(clean);}catch{if(clean.startsWith('{')||clean.startsWith('['))throw new Error('Incomplete model JSON');}
  const caption=(typeof parsed?.caption==='string'?parsed.caption:parsed?null:text)?.trim();
  if(!caption||caption.length>4000)throw new Error('Invalid AI caption');
  const suggested=typeof parsed?.image_prompt==='string'?parsed.image_prompt:'';
  const imagePrompt=!suggested||/(photo|realistic|injur|blood|dramatic|distress|wreck|eyewitness)/i.test(suggested)?`Editorial illustration about: ${article.title||'this news story'}. Use symbolic shapes and a calm neutral composition, no recreated accident scene or injured people, no fabricated documentary evidence, no text overlay.`:`Illustration only, not documentary evidence. ${suggested}`;
  return {caption:caption.slice(0,1800),analysis:typeof parsed?.analysis==='string'?parsed.analysis.slice(0,1800):'Review facts, attribution and uncertainty against the linked source before approval.',image_prompt:imagePrompt.slice(0,1200)};
}
export function draftQuality(draft,page,article={}){
  if(draft.caption.length<180)return 'Caption is too short; a headline alone is not an editorial draft';
  if(page.language==='Bangla'){
    const letters=draft.caption.match(/\p{L}/gu)||[],bangla=draft.caption.match(/[\u0980-\u09ff]/g)||[];
    if(bangla.length/Math.max(1,letters.length)<0.6)return 'Caption does not use the requested Bangla language';
  }
  const source=String(article.body||'').replace(/\s+/g,' ').trim();
  if(source&&draft.caption.split(/\n\s*\n/).some(p=>{const text=p.replace(/\s+/g,' ').trim();return text.length>200&&source.includes(text);}))return 'Caption copies a long source paragraph instead of rewriting it';
  return null;
}
export function contentPanel(article){
  if(article.status==='Posted')return 'Published';
  if(article.status==='Approved')return 'Scheduled';
  if(article.caption&&['Draft','Pending Approval','Dry Run','Queued'].includes(article.status))return 'Drafts';
  return article.status==='Queued'?'News inbox':'Needs attention';
}
