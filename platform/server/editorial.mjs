const latin=s=>String(s||'').replace(/[০-৯]/g,c=>String('০১২৩৪৫৬৭৮৯'.indexOf(c)));
export function editorialWarnings(caption,facts,niche=''){
 const source=latin(JSON.stringify(facts)),output=latin(caption),warnings=[];
 const numbers=s=>(s.match(/\d+(?:[.,]\d+)*/g)||[]).map(x=>String(Number(x.replaceAll(',',''))));
 const known=new Set(numbers(source));const extra=[...new Set(numbers(output).filter(x=>!known.has(x)))];
 if(extra.length)warnings.push('Check numbers absent from the supplied facts: '+extra.join(', '));
 if(/limited time|hurry|selling fast|best.?seller|guaranteed|free shipping|সীমিত সময়|স্টক শেষ|নিশ্চয়তা/i.test(output)&&!/limited time|hurry|selling fast|best.?seller|guaranteed|free shipping|সীমিত সময়|স্টক শেষ|নিশ্চয়তা/i.test(source))warnings.push('Urgency, popularity or guarantees need source support.');
 if(/#(?:mens|womens|kids|children)/i.test(output)&&!/(men|women|kids|children|পুরুষ|মহিলা|শিশু)/i.test(source+' '+niche))warnings.push('Audience or gender hashtags were inferred; review their relevance.');
 if(/https?:\/\//i.test(output))warnings.push('An external URL was generated; automatic link sharing is disabled.');
 const sourceYears=new Set(source.match(/\b(?:19|20)\d{2}\b/g)||[]);if(sourceYears.size>1&&/elected|election|নির্বাচিত|নির্বাচন/i.test(output)&&[...sourceYears].some(y=>!output.includes(y)))warnings.push('The source mentions several years. Check that historical election results are not described as current.');
 return warnings;
}
