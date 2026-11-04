import {inWindow,localDay} from './core.mjs';
import {editorialReviewReason} from './editorial.mjs';
export const needsReview=(page,article,preview=false)=>preview||((page.approval||!!editorialReviewReason(article))&&(!article.caption_hash||article.approval_hash!==article.caption_hash));

// A calendar reservation is checked again at delivery: actual publication times
// may move when the PC is offline, a previous post is late or Meta throttles us.
export function slotProblem(page,at,posts=[],excludeId){
  const time=new Date(at);
  if(!Number.isFinite(time.getTime()))return 'Choose a valid scheduled time';
  if(!inWindow(time,page))return `Choose a time inside ${page.start}–${page.end} (${page.timezone})`;
  if(page.dailyMax<1)return 'This Page has a daily cap of zero';
  const reserved=posts.filter(p=>p.id!==excludeId&&['Approved','Posted','Publishing','Publish Unknown'].includes(p.status));
  if(reserved.filter(p=>localDay(new Date(p.published_at||p.scheduled_at||p.updated_at),page.timezone)===localDay(time,page.timezone)).length>=page.dailyMax)return 'Daily cap already reserved for this date; choose another day';
  if(reserved.some(p=>{const date=p.published_at||p.scheduled_at||(['Publishing','Publish Unknown'].includes(p.status)?p.updated_at:null);return date&&Math.abs(new Date(date)-time)<page.minimumGap*60000;}))return `Leave at least ${page.minimumGap} minutes between this Page’s posts`;
  return null;
}
export function nextSlot(page,posts=[],{from=new Date(),excludeId}={}){
  const first=Math.ceil(new Date(from).getTime()/60000)*60000;
  for(let time=first;time<=first+31*86400000;time+=60000){const at=new Date(time);if(!slotProblem(page,at,posts,excludeId))return at.toISOString();}
  return null;
}
export function suggestedHashtags(article,language='Bangla'){
  const text=String(article.title||'')+' '+String(article.caption||'');
  const bn=language!=='English',tags=[];
  for(const [pattern,bangla,english] of [
    [/ক্রিকেট|cricket/i,'ক্রিকেট','Cricket'],[/ফুটবল|football/i,'ফুটবল','Football'],
    [/নির্বাচন|ভোট|election/i,'নির্বাচন','Election'],[/শিক্ষা|বিদ্যাল|বিশ্ববিদ্যাল|education/i,'শিক্ষা','Education'],
    [/প্রযুক্তি|কৃত্রিম বুদ্ধিমত্তা|technology/i,'প্রযুক্তি','Technology'],[/অর্থনীতি|মূল্যস্ফীতি|economy/i,'অর্থনীতি','Economy'],
    [/আবহাওয়া|বৃষ্টি|ঘূর্ণিঝড়|weather/i,'আবহাওয়া','Weather'],[/স্বাস্থ্য|চিকিৎসা|health/i,'স্বাস্থ্য','Health'],
    [/ঢাকা|dhaka/i,'ঢাকা','Dhaka'],[/বাংলাদেশ|bangladesh/i,'বাংলাদেশ','Bangladesh']
  ])if(pattern.test(text))tags.push('#'+(bn?bangla:english));
  return [...new Set(tags)].slice(0,3);
}
export function withSuggestedHashtags(caption,article,language){
  if(/#[\p{L}\p{N}_]/u.test(caption))return caption;
  const tags=suggestedHashtags({...article,caption},language).join(' ');
  return tags&&caption.length+tags.length+2<=1800?caption+'\n\n'+tags:caption;
}
