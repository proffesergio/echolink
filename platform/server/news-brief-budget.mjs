import {evidenceConflicts,newsWords} from './news-quality.mjs';

const qualification=/অভিযোগ|অভিযুক্ত|দাবি|অস্বীকার|নাকচ|সম্ভাবনা|হতে পারে|তবে|কিন্তু|যদিও|হয়নি|হয়নি|করেননি|করেনি|পারেননি|পারেনি|denied|alleged|however|did not/iu;
// Select whole source sentences, never truncate a denial or a disputed claim.
export function compactBriefEvidence(facts,{maxChars=2000,maxWords=200}={}){
 const conflicts=evidenceConflicts(facts),required=new Set(facts.filter(f=>f.source===0).slice(0,3).map(f=>f.id));
 for(const f of facts)if(qualification.test(f.text))required.add(f.id);
 for(const pair of conflicts)for(const id of pair)required.add(id);
 const chosen=facts.filter(f=>required.has(f.id));
 const fits=items=>items.reduce((n,f)=>n+f.text.length,0)<=maxChars&&newsWords(items.map(f=>f.text).join(' '))<=maxWords;
 if(!fits(chosen))return {hold:true,message:'This source has more essential qualifications or conflicting claims than the local brief can safely cover. Retained for editorial review; the queue can select another story.'};
 // Related repetition adds prefill cost. Keep primary context plus mandatory
 // related qualifications/conflicts, rather than another entire article.
 for(const f of facts.filter(f=>f.source===0&&!required.has(f.id)))if(fits([...chosen,f]))chosen.push(f);
 const ids=new Set(chosen.map(f=>f.id));
 return {evidence:facts.filter(f=>ids.has(f.id)),conflicts,omittedEvidenceIds:facts.filter(f=>!ids.has(f.id)).map(f=>f.id)};
}
