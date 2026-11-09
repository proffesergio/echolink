import {captionPrompt,prepareCaption} from './prompts.mjs';
import {textCompletion} from './providers.mjs';
import {editorialWarnings,criticalEditorialWarnings} from './editorial.mjs';
import {groundedProductCaption,groundedBanglaProductCaption} from './grounded-product-caption.mjs';
import {hasOperationalCopy} from './public-copy.mjs';
export function captionLanguageWarnings(caption,page){
 const prose=String(caption||'').replace(/#[\p{L}\p{M}\p{N}_]+/gu,'');
 if(page.language==='Bilingual-Mix'&&((prose.match(/[\u0980-\u09ff]/gu)||[]).length<12||/[\p{Script=Devanagari}\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(prose)))return ['Language policy requires natural Bengali product copy with useful English terms, without unrelated scripts.'];
 if(page.language==='Bangla'&&((prose.match(/[\u0980-\u09ff]/gu)||[]).length<12||/(?:^|[।!?]\s+|\n)[A-Za-z][^।\n]{12,}\b(?:is|are|with|for|your|our|the|this|discover|message|crafted|designed)\b[^।\n]{8,}[.!?]/iu.test(prose)))return ['Language policy requires a Bangla caption without a parallel English summary.'];
 if(page.language==='Bangla'&&(/[\p{Script=Devanagari}\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(prose)||/[\u0980-\u09ff][A-Za-z]{3,}/u.test(prose)))return ['Language policy found unrelated script or a corrupted mixed-script word. Correct it against the source before publication.'];
 if(page.language==='English'&&/[\u0980-\u09ff]{3,}/u.test(caption))return ['Language policy requires a consistent English caption.'];
 return [];
}
export async function generateFactualCaption({page,post,product,connection,secret={},channel='facebook',insights=null,compact=false},{complete=textCompletion,onMetrics=()=>{},onCorrection=async()=>{}}={}){
 const purpose=product?(channel==='instagram'?'instagram_caption':'product_caption'):['news','blog'].includes(post.type)?'news_caption':'general';
 const {facts,system,prompt}=captionPrompt(page,post,product,insights,channel,{compact});
 const grounded=compact&&product&&page.language==='Bilingual-Mix',banglaProduct=compact&&product&&page.language==='Bangla',prepare=raw=>{
  const prepared=prepareCaption(grounded?groundedProductCaption(raw,page,product):banglaProduct?groundedBanglaProductCaption(raw,page,product):raw,page,product);
  if(['news','blog'].includes(post.type)){
   const categories={bangladesh:'বাংলাদেশ',world:'বিশ্বসংবাদ',politics:'রাজনীতি',business:'অর্থনীতি',sports:'খেলাধুলা',technology:'প্রযুক্তি',education:'শিক্ষা',health:'স্বাস্থ্য',entertainment:'বিনোদন',lifestyle:'জীবনযাপন',environment:'পরিবেশ',general:'সংবাদ'},category=post.seo?.category||'general',brand=String(page.name||'').replace(/[^\p{L}\p{M}\p{N}_]/gu,'');
   const tag=page.language==='English'?(category==='general'?'News':category):categories[category]||'সংবাদ';
   prepared.caption=prepared.caption.replace(/#[\p{L}\p{M}\p{N}_]+/gu,'').trim()+'\n\n'+[brand?'#'+brand:'','#'+tag].filter(Boolean).join(' ');
  }return prepared;
 };
 let rawCaption=await complete(connection,secret,prompt,{systemPrompt:system,onMetrics,purpose}),prepared=prepare(rawCaption);
 const checks=caption=>[...editorialWarnings(caption,facts,page.niche),...captionLanguageWarnings(caption,page),...(hasOperationalCopy(caption)?['Audience copy contains delivery instructions.']:[])];
 const initial=criticalEditorialWarnings(checks(prepared.caption));
 if(initial.length){
  await onCorrection(initial);
  rawCaption=await complete(connection,secret,`Correct this caption using only the source JSON. Remove unsupported statements instead of guessing. Do not add dates, years, ages, amounts or counts absent from the source. Keep approximate quantities approximate and proposals tentative; preserve words such as প্রায়, পরিকল্পনা and not final when relevant. Preserve the primary topic, attribution and factual qualifications. ${grounded?'Return only one short English product sentence, without CTA or hashtags.':banglaProduct?'Return only a short natural Bangla product opening, no CTA/specification list/hashtags.':'Preserve the Page language ('+page.language+') and return only a concise final caption, no parallel translation.'}\nChecks: ${JSON.stringify(initial)}\nSource: ${JSON.stringify(facts)}\nDraft: ${grounded?rawCaption:prepared.caption}`,{systemPrompt:system,onMetrics,purpose});
  const repaired=prepare(rawCaption);
  if(repaired.caption.trim())prepared={caption:repaired.caption,notes:[...prepared.notes,...repaired.notes,'An automatic factual correction pass was applied.']};
 }
 const warnings=checks(prepared.caption);
 if(grounded)prepared.notes.push('Bilingual framing preserves verified catalog specifications; the model supplies the English product line.');
 return {...prepared,rawCaption,facts,warnings,initialWarnings:initial,needsCorrection:criticalEditorialWarnings(warnings).length>0};
}
