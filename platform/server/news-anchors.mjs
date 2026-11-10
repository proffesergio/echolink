const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// Source-derived lexical constraints, not invented facts or generated context.
export function factAnchors(text){
 const found=[...String(text).matchAll(/[০-৯0-9]+(?:[.,][০-৯0-9]+)*|চেষ্টা\s+(?:করেননি|করেনি)|অস্বীকার|নাকচ|সম্ভাবনা|অভিযোগ|অভিযুক্ত|দাবি|হয়নি|হয়নি|করেননি|করেনি|পারেননি|পারেনি|নেননি|নেয়নি|নেয়নি|প্রথম|দ্বিতীয়|দ্বিতীয়|তৃতীয়|তৃতীয়|চতুর্থ|পঞ্চম|ষষ্ঠ|সপ্তম|অষ্টম|নবম|দশম|স্বাগতিক|সফরকারী/gu)];
 return [...new Set(found.map(m=>m[0]))].slice(0,12);
}
export function factRewriteSchema(group){return {type:'object',additionalProperties:false,properties:{facts:{type:'object',additionalProperties:false,properties:Object.fromEntries(group.map(f=>{const anchors=factAnchors(f.text);return [f.id,{type:'string',minLength:12,maxLength:1800,pattern:'^[^"“”‘’{}\\[\\]]*'+anchors.map(escape).join('[^"“”‘’{}\\[\\]]*')+'[^"“”‘’{}\\[\\]]*$'}];})),required:group.map(f=>f.id)}},required:['facts']};}
