// Conservative review signals, not a claim of factual verification. In
// particular, matching numbers do not prove the right subject or relationship.
const banglaDigits='০১২৩৪৫৬৭৮৯';
const normalized=text=>String(text||'').normalize('NFKC').replace(/[০-৯]/g,digit=>String(banglaDigits.indexOf(digit))).replace(/\s+/gu,' ').trim();
const factualText=text=>normalized(text).replace(/https?:\/\/[^\s]+/giu,'').replace(/#[\p{L}\p{M}\p{N}_]+/gu,'');
function numbers(text){
  const clean=factualText(text);
  return new Set((clean.match(/\d+(?:[.,]\d+)*/g)||[]).map(value=>{
    const [whole,...fraction]=value.replace(/,/g,'').split('.');
    const integer=whole.replace(/^0+(?=\d)/,'');
    // Keep multi-dot versions/dates distinct rather than treating them as a
    // decimal. This avoids numeric precision loss for identifiers and amounts.
    if(fraction.length>1)return [integer,...fraction].join('.');
    const decimal=(fraction[0]||'').replace(/0+$/,'');
    return decimal?`${integer}.${decimal}`:integer;
  }));
}
function transitions(text){
  const value=String.raw`\d+(?:[.,]\d+)*`,unit=String.raw`(?:\s*(?:শতাংশ(?:ে)?|ভাগ|টাকা(?:য়|য়)?|কোটি|লাখ|হাজার|percent|per cent|%)){0,3}`;
  const patterns=[new RegExp(`(?<![\\d.,−-])(${value})${unit}\\s*(?:থেকে|হতে)\\s*(?:(?:কমে|বেড়ে|বেড়ে|নেমে|উঠে)\\s*)?(${value})`,'giu'),new RegExp(`\\bfrom\\s+(${value})${unit}\\s+to\\s+(${value})`,'giu')];
  const result=new Set();
  for(const pattern of patterns)for(const match of factualText(text).matchAll(pattern)){
    const first=[...numbers(match[1])][0],second=[...numbers(match[2])][0];if(first!==second)result.add(`${first}→${second}`);
  }
  return result;
}
function temporalRateConflict(text){
  // Only an unambiguous pair of positive percentage figures for one period type.
  // Multiple metrics, signs and general entity/figure attribution are not inferred.
  const groups=new Map(),pattern=/(আগের|গত|পূর্ববর্তী|চলতি|এই|বর্তমান)\s*(মাসে|বছরে|সপ্তাহে)(?!র)\s*([^\d।.!?]{0,90})(\d+(?:[.,]\d+)*)\s*(?:শতাংশ|%)/gu;
  for(const match of factualText(text).matchAll(pattern)){
    if(/[-−]\s*$/u.test(match[3]))continue;
    const key=match[2],group=groups.get(key)||{past:[],current:[]},entry={value:[...numbers(match[4])][0],context:match[3]};
    group[/^(আগের|গত|পূর্ববর্তী)$/u.test(match[1])?'past':'current'].push(entry);groups.set(key,group);
  }
  const up=new RegExp(['বেড়ে','বেড়ে','বাড়','বাড়','বৃদ্ধি','উঠে'].map(normalized).join('|'),'u'),down=new RegExp(['কমে','হ্রাস','নেমে'].map(normalized).join('|'),'u');
  for(const {past,current} of groups.values()){
    if(past.length!==1||current.length!==1||[past[0],current[0]].some(entry=>entry.value.split('.').length>2))continue;
    const values=[past[0].value,current[0].value].map(value=>{const [whole,fraction='']=value.split('.');return {whole,fraction};}),digits=Math.max(...values.map(v=>v.fraction.length));
    const [before,after]=values.map(v=>BigInt(v.whole+v.fraction.padEnd(digits,'0'))),context=current[0].context;
    if((after<before&&up.test(context)&&!down.test(context))||(after>before&&down.test(context)&&!up.test(context)))return true;
  }
  return false;
}
export function editorialReviewReason(article){
  const analysis=String(article.analysis||'');
  if(/\bEDITORIAL[ _-]+REVIEW[ _-]+REQUIRED\b/i.test(analysis)||/সম্পাদক[ীি]য় যাচাই (?:প্রয়োজন|প্রয়োজন)|সম্পাদক[ীি]য় যাচাই (?:প্রয়োজন|প্রয়োজন)/u.test(analysis))
    return 'Editorial review required: the analysis flags a source conflict or uncertainty. Compare the caption with the original source before approving.';
  const supported=numbers(`${article.title||''}\n${article.body||''}`);
  const missing=[...numbers(article.caption)].filter(value=>!supported.has(value));
  if(missing.length)return `Editorial review required: caption numbers not found in the supplied source (${missing.slice(0,8).join(', ')}). Verify the figures or edit the caption before approving.`;
  const analysisFacts=analysis.replace(/[০-৯]/g,digit=>String(banglaDigits.indexOf(digit))).replace(/(^|\n)\s*[12][.)]\s+/g,'$1');
  const unsupportedAnalysis=[...numbers(analysisFacts)].filter(value=>!supported.has(value));
  if(unsupportedAnalysis.length)return `Editorial review required: analysis numbers not found in the supplied source (${unsupportedAnalysis.slice(0,8).join(', ')}). Verify the notes and caption against the source before approving.`;
  if(temporalRateConflict(article.caption))return 'Editorial review required: the caption’s increase/decrease wording conflicts with its previous/current percentage figures. Verify the figures and trend before approving.';
  const source=String(article.body||''),sourceTransitions=transitions(source);
  for(const pair of transitions(article.caption)){
    const reversed=pair.split('→').reverse().join('→');
    if(sourceTransitions.has(reversed)&&!sourceTransitions.has(pair))return `Editorial review required: caption reverses a numeric transition reported in the source (${reversed} versus ${pair}). Verify the subject, figures and direction before approving.`;
  }
  const sourceText=normalized(`${article.title||''}\n${source}`);
  const captionText=normalized(article.caption);
  const stockClaims=[
    {claim:/(?:প্রশাসন|কর্তৃপক্ষ|পুলিশ|দপ্তর)[^।.!?\n]{0,100}(?:নজর (?:রাখছে|রেখেছে)|নজরদারি (?:করছে|চালাচ্ছে)|তদারক|পর্যবেক্ষণ (?:করছে|চালাচ্ছে)|নিয়মিত(?:ভাবে)?[^।.!?\n]{0,25}(?:জরিপ|সার্ভে))/u,support:/নজর|তদারক|পর্যবেক্ষণ|নিয়মিত|monitor|surveil|regular survey/iu,detail:'ongoing monitoring or regular surveys'},
    {claim:/(?:প্রশাসন|কর্তৃপক্ষ)[^।.!?\n]{0,90}(?:সংস্কার|মেরামত)[^।.!?\n]{0,50}(?:করছে|শুরু করেছে|জোর দিচ্ছে|চালাচ্ছে)/u,support:/সংস্কার|মেরামত|repair|renovat/iu,detail:'repair or renovation action'}
  ];
  for(const check of stockClaims)if(check.claim.test(captionText)&&!check.support.test(sourceText))return `Editorial review required: the caption adds ${check.detail} not described in the supplied source. Remove the unsupported claim or verify it before approving.`;
  for(const match of String(article.caption||'').matchAll(/"([^"\n]{20,1800})"|“([^”\n]{20,1800})”|‘([^’\n]{20,1800})’/gu)){
    const quote=match[1]||match[2]||match[3];
    if(!sourceText.includes(normalized(quote)))return 'Editorial review required: a direct quotation is not present verbatim in the supplied source. Check the attribution and wording; translations or paraphrases need explicit review.';
  }
  return null;
}
