const latin=s=>String(s||'').replace(/[০-৯]/g,c=>String('০১২৩৪৫৬৭৮৯'.indexOf(c)));
const wordNumbers={'শূন্য':0,'এক':1,'দুই':2,'তিন':3,'চার':4,'পাঁচ':5,'ছয়':6,'ছয়':6,'সাত':7,'আট':8,'নয়':9,'নয়':9,'দশ':10,'এগারো':11,'বারো':12,'তেরো':13,'চৌদ্দ':14,'পনেরো':15,'ষোলো':16,'সতেরো':17,'আঠারো':18,'উনিশ':19,'বিশ':20};
export function sourceNumbers(value){
 let text=latin(value);const found=(text.match(/\d+(?:[.,]\d+)*/g)||[]).map(x=>String(Number(x.replaceAll(',','')))),words=Object.keys(wordNumbers).join('|'),scales={'শত':100,'শো':100,'হাজার':1000,'লাখ':100000,'লক্ষ':100000,'কোটি':10000000};
 text=text.replace(new RegExp('(?<![\\p{L}\\p{M}])('+words+')\\s*(শত|শো|হাজার|লাখ|লক্ষ|কোটি)(?![\\p{L}\\p{M}])','gu'),(_match,n,scale)=>{found.push(String(wordNumbers[n]*scales[scale]));return ' ';});
 for(const match of text.matchAll(new RegExp('(?<![\\p{L}\\p{M}])('+words+')(?![\\p{L}\\p{M}])','gu')))found.push(String(wordNumbers[match[1]]));
 return found;
}
export const criticalEditorialWarnings=warnings=>(warnings||[]).filter(w=>/^(Check numbers|Source qualification|Urgency|The source mentions several years|An external URL|Language policy|Audience copy|Website article depth|Content format)/.test(w.replace(/^(?:Instagram|Website article|Design brief): /,'')));
export function editorialWarnings(caption,facts,niche=''){
 const source=latin(JSON.stringify(facts)),output=latin(caption),warnings=[];
 const numbers=s=>(s.match(/\d+(?:[.,]\d+)*/g)||[]).map(x=>String(Number(x.replaceAll(',',''))));
 const known=new Set(sourceNumbers(source));const extra=[...new Set(sourceNumbers(output).filter(x=>!known.has(x)))];
 if(extra.length)warnings.push('Check numbers absent from the supplied facts: '+extra.join(', '));
 const approximate=/(?:প্রায়|প্রায়|আনুমানিক|approximately|roughly|about)\s+([^।.!?"\n]{1,45})/giu;
 const qualifiedNumbers=[...source.matchAll(approximate)].flatMap(m=>sourceNumbers(m[1]));
 // Alphanumeric product identifiers are not repeated estimated quantities.
 const quantities=output.replace(/\b[A-Za-z][A-Za-z0-9-]*\d[A-Za-z0-9-]*\b/g,'');
 if(qualifiedNumbers.some(n=>sourceNumbers(quantities).includes(n))&&!/(?:প্রায়|প্রায়|আনুমানিক|approximately|roughly|about)/iu.test(output))warnings.push('Source qualification: preserve approximately/about when repeating an estimated quantity.');
 const assertions=output.replace(/\b(?:not|never)\s+guaranteed\b|\bcannot\s+be\s+guaranteed\b/gi,'');
 if(/limited time|hurry|selling fast|best.?seller|guaranteed|free shipping|সীমিত সময়|স্টক শেষ|স্টক সীমিত|নিশ্চয়তা/i.test(assertions)&&!/limited time|hurry|selling fast|best.?seller|guaranteed|free shipping|সীমিত সময়|স্টক শেষ|স্টক সীমিত|নিশ্চয়তা/i.test(source))warnings.push('Urgency, popularity or guarantees need source support.');
 if(/#(?:mens|womens|kids|children)/i.test(output)&&!/(men|women|kids|children|পুরুষ|মহিলা|শিশু)/i.test(source+' '+niche))warnings.push('Audience or gender hashtags were inferred; review their relevance.');
 if(/https?:\/\//i.test(output))warnings.push('An external URL was generated; automatic link sharing is disabled.');
 const sourceYears=new Set(source.match(/\b(?:19|20)\d{2}\b/g)||[]);if(sourceYears.size>1&&/elected|election|নির্বাচিত|নির্বাচন/i.test(output)&&[...sourceYears].some(y=>!output.includes(y)))warnings.push('The source mentions several years. Check that historical election results are not described as current.');
 return warnings;
}
