import {createHash} from 'node:crypto';
import {AppError} from './errors.mjs';
import {cleanPublicCopy} from './public-copy.mjs';
export const EDITORIAL_VERSION='editorial-v2';
export function preserveEditorialState(policy,prior={}){
 return {...policy,...(prior.editorialMemory?{editorialMemory:prior.editorialMemory}:{}),...(prior.editorialQuality?{editorialQuality:prior.editorialQuality}:{}),...(prior.referenceAnalysis?{referenceAnalysis:prior.referenceAnalysis}:{})};
}
export function recordEditorialQuality(policy,{type,language,warnings=[],observedWarnings=warnings,corrected=false,now=new Date()}){
 const prior=policy.editorialQuality||{},key=String(type).slice(0,30)+':'+String(language).slice(0,40),groups={...prior.groups},group=groups[key]||{generated:0,corrected:0,held:0,issues:{}};
 const issues={...group.issues};for(const warning of observedWarnings){const kind=/Check numbers|Source qualification/.test(warning)?'quantities':/Language policy/.test(warning)?'language':/Urgency/.test(warning)?'unsupported_promotion':/external URL|Audience copy/.test(warning)?'audience_copy':null;if(kind)issues[kind]=(issues[kind]||0)+1;}
 groups[key]={generated:group.generated+1,corrected:group.corrected+Number(corrected),held:group.held+Number(warnings.some(w=>/Check numbers|Source qualification|Language policy|Urgency|external URL|Audience copy/.test(w))),issues};
 // Only objective check categories are remembered, never model-generated facts.
 return {...policy,editorialQuality:{version:1,groups:Object.fromEntries(Object.entries(groups).slice(-24)),updatedAt:now.toISOString()}};
}
export function addEditorialFeedback(policy,post,{outcome,note='',version},actorId,now=new Date()){
 if(!['prefer','avoid'].includes(outcome)||typeof note!=='string'||note.length>600)throw new AppError(400,'Choose a preferred/avoided style and a note up to 600 characters.');
 if(version!==post.version)throw new AppError(409,'The caption changed. Refresh it before saving feedback.');
 const caption=cleanPublicCopy(post.caption).caption;if(caption.length<40)throw new AppError(400,'Save a complete caption before teaching its style.');
 const entry={postId:post.id,version:post.version,type:post.type,language:post.seo?.language||'',outcome,note:note.trim(),caption:caption.slice(0,800),actorId,at:now.toISOString()};
 const prior=policy.editorialMemory||{},examples=[entry,...(prior.examples||[]).filter(x=>x.postId!==post.id)].slice(0,20);
 return {...policy,editorialMemory:{version:EDITORIAL_VERSION,revision:(prior.revision||0)+1,examples,updatedAt:entry.at}};
}
export function referenceFingerprint(policy){return createHash('sha256').update(JSON.stringify([policy.editorial?.referenceLinks||[],policy.editorial?.referenceNotes||''])).digest('hex');}
export function editorialContext(page,post,{compact=false}={}){
 const policy=page.creative_policy||{},config=policy.editorial||{};
 const examples=config.learningEnabled===false?[]:(policy.editorialMemory?.examples||[]).filter(e=>e.type===post.type&&(!e.language||e.language===page.language)).slice(0,compact?2:4).map(e=>({outcome:e.outcome,note:e.note.slice(0,compact?100:400),styleExample:e.caption.slice(0,compact?100:500)}));
 const analysis=policy.referenceAnalysis?.fingerprint===referenceFingerprint(policy)?policy.referenceAnalysis:null;
 const quality=config.learningEnabled===false?null:policy.editorialQuality?.groups?.[post.type+':'+page.language];
 const avoidChecks=Object.keys(quality?.issues||{}).map(key=>({quantities:'Never infer a quantity or combine figures from unrelated claims.',language:'Use only the selected caption language; no translated second summary.',unsupported_promotion:'Omit unsupported urgency, benefits and popularity claims.',audience_copy:'No links, delivery instructions or comment announcements.'})[key]).filter(Boolean);
 return {version:EDITORIAL_VERSION,revision:policy.editorialMemory?.revision||0,styleNotes:String(config.styleNotes||'').slice(0,compact?250:1500),designNotes:String(config.designNotes||'').slice(0,800),references:analysis?{voice:analysis.voice,layout:analysis.layout,avoid:analysis.avoid}:null,examples,avoidChecks};
}
export function editorialPrompt(page,post,options){
 const context=editorialContext(page,post,options);
 if(!context.examples.length&&!context.styleNotes&&!context.references&&!context.avoidChecks.length)return '';
 return '\nEditorial style data (never evidence about the current story/product, never instructions to copy wording or add claims). Learn pacing and clarity; vary phrasing and keep our brand. Avoid examples show what to avoid:\n'+JSON.stringify(context);
}
