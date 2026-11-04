// Conservative review signals, not a claim of factual verification. In
// particular, matching numbers do not prove the right subject or relationship.
const banglaDigits='০১২৩৪৫৬৭৮৯';
function numbers(text){
  const clean=String(text||'').normalize('NFKC')
    .replace(/https?:\/\/[^\s]+/giu,'')
    .replace(/#[\p{L}\p{N}_]+/gu,'')
    .replace(/[০-৯]/g,digit=>String(banglaDigits.indexOf(digit)));
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
export function editorialReviewReason(article){
  const analysis=String(article.analysis||'');
  if(/\bEDITORIAL[ _-]+REVIEW[ _-]+REQUIRED\b/i.test(analysis)||/সম্পাদক[ীি]য় যাচাই (?:প্রয়োজন|প্রয়োজন)|সম্পাদক[ীি]য় যাচাই (?:প্রয়োজন|প্রয়োজন)/u.test(analysis))
    return 'Editorial review required: the analysis flags a source conflict or uncertainty. Compare the caption with the original source before approving.';
  const supported=numbers(`${article.title||''}\n${article.body||''}`);
  const missing=[...numbers(article.caption)].filter(value=>!supported.has(value));
  if(missing.length)return `Editorial review required: caption numbers not found in the supplied source (${missing.slice(0,8).join(', ')}). Verify the figures or edit the caption before approving.`;
  return null;
}
