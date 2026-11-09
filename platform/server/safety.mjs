import {createHash} from 'node:crypto';
import {storySimilarity} from './news-research.mjs';
export const crisisKeywords=['ভয়াবহ দুর্ঘটনা','ভয়াবহ দুর্ঘটনা','প্রাণহানি','নিহত','গণহত্যা','জাতীয় শোক','জাতীয় শোক','ধর্ষণ','ভূমিকম্প','ঘূর্ণিঝড়','ঘূর্ণিঝড়','mass casualty','fatal accident','national mourning','earthquake','severe flooding','terrorist attack'];
const normalize=s=>String(s||'').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
export function crisisMatches(text,extra=[]){const input=normalize(text);return [...new Set([...crisisKeywords,...extra].map(normalize).filter(k=>k&&input.includes(k)))].slice(0,20);}
export const safetyFingerprint=post=>createHash('sha256').update(String(post.title)+'\n'+String(post.body)).digest('hex');
export function preflightContent(post,recent=[],policy={}){
 const duplicate=['news','blog'].includes(post.type)?recent.slice(0,50).find(p=>p.id!==post.id&&(normalize(p.title)===normalize(post.title)||storySimilarity(p.title,post.title)>=.8)):null;
 const matches=policy.crisisFilter===false?[]:crisisMatches(post.title+'\n'+post.body,policy.sensitiveKeywords||[]),fingerprint=safetyFingerprint(post);
 const permitted=post.seo?.safety?.permitGeneration===true&&post.seo.safety.fingerprint===fingerprint;
 return {duplicateId:duplicate?.id||null,highAlert:matches.length>0,matches,fingerprint,hold:!!matches.length&&!permitted};
}
