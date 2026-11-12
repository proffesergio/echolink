import {CONTENT_WORKFLOWS} from '../shared/content-workflow.mjs';
import {z} from 'zod';
import {AppError} from './errors.mjs';
import {publicURL} from './net.mjs';

export const entityTypeSchema=z.enum(['PERSONAL_PROFILE','BUSINESS_PAGE','CREATOR_PAGE']);
export const profileLanguageSchema=z.enum(['Bangla','English','Bilingual-Mix']);
const languageCode=z.enum(['bn','en']),fontId=z.string().uuid().nullable().optional(),hex=z.string().regex(/^#[a-fA-F0-9]{6}$/);
export const profileFontFamilies=['Noto Sans Bengali','sans-serif','serif','Hind Siliguri','SolaimanLipi','Inter','Space Grotesk','JetBrains Mono'];
const family=z.enum(profileFontFamilies);
export const typographyConfigSchema=z.object({
 headline_font_family:family.optional(),body_font_family:family.optional(),
 headline_font_asset_id:fontId,body_font_asset_id:fontId,
 palette:z.object({primary:hex.optional(),background:hex.optional(),text:hex.optional()}).strict().optional(),
 padding:z.number().int().min(16).max(160).optional(),watermark:z.string().trim().max(100).optional(),
 layout:z.enum(['editorial','bold','minimal']).optional()
}).strict();
export const DOMAIN_PRESETS={
 ISLAMIC_SCIENCE_AI:'Combine Islamic learning, science and AI/technology carefully. Topic pillars: AI/Tech, Muslim Polymaths, Digital Ethics. Distinguish religious text, historical evidence, scientific findings and ethical opinion. Never invent Quran/hadith quotations, authenticity gradings, biographies, discoveries, scientific consensus or AI benchmarks. Preserve references and uncertainty; request human evidence review for religious rulings or disputed claims.',
 GENERAL:'Use supplied facts and original useful explanation. Do not fabricate sources or personal experience.',
 ISLAMIC:'For Islamic content, preserve Quran surah/ayah and hadith collection/reference identifiers exactly. Distinguish scripture, interpretation and scholarly opinion. Never invent a verse, hadith, authenticity grading, fatwa or religious quotation. If the supplied evidence lacks the claimed reference, hold the claim for human review.',
 EDUCATION:'For education, explain concepts at the intended level, distinguish examples from established facts, and preserve curriculum/reference attribution. Never invent credentials, exam outcomes or guaranteed learning results.',
 SCIENCE:'For science, distinguish peer-reviewed findings, hypotheses and preliminary results. Preserve uncertainty, study limitations and units. Correlation is not causation. Never invent citations or consensus.',
 AI:'For AI, distinguish measured capabilities from marketing or speculation. Preserve model/version/date and benchmark conditions when supplied. Never invent benchmarks, tool capabilities, sources or claims of sentience.'
};
export const profileConfigSchema=z.object({
 content_workflow:z.enum(CONTENT_WORKFLOWS).optional(),
 language_mode:z.enum(['SINGLE_LANGUAGE','DUAL_BILINGUAL']).optional(),primary_language:languageCode.optional(),
 languages:z.array(languageCode).min(1).max(2).refine(v=>new Set(v).size===v.length,'Languages must be unique.').optional(),
 typography_config:typographyConfigSchema.optional(),domain_preset:z.enum(['GENERAL','ISLAMIC','EDUCATION','SCIENCE','AI','ISLAMIC_SCIENCE_AI']).optional(),
 grounding:z.object({references:z.array(z.string().url().max(2000).refine(v=>{try{publicURL(v);return true;}catch{return false;}},'Use a public HTTPS reference URL.')).max(12).optional(),topic_pillars:z.array(z.string().trim().min(1).max(200)).max(20).optional()}).strict().optional(),
 language:profileLanguageSchema.optional()
}).strict().superRefine((config,ctx)=>{
 if(config.language_mode==='DUAL_BILINGUAL'&&config.languages&&!(config.languages.includes('bn')&&config.languages.includes('en')))ctx.addIssue({code:'custom',path:['languages'],message:'Dual bilingual mode requires both en and bn.'});
 if(config.language_mode==='SINGLE_LANGUAGE'&&config.languages&&config.languages.length!==1)ctx.addIssue({code:'custom',path:['languages'],message:'Single language mode requires one language.'});
 if(config.primary_language&&config.languages&&!config.languages.includes(config.primary_language))ctx.addIssue({code:'custom',path:['primary_language'],message:'Primary language must be included in languages.'});
 if(config.language_mode==='SINGLE_LANGUAGE'&&config.language==='Bilingual-Mix'||config.language_mode==='DUAL_BILINGUAL'&&config.language&&config.language!=='Bilingual-Mix')ctx.addIssue({code:'custom',path:['language'],message:'Legacy language must agree with language mode.'});
 if(config.primary_language&&config.language&&config.language!=='Bilingual-Mix'&&config.language!==(config.primary_language==='bn'?'Bangla':'English'))ctx.addIssue({code:'custom',path:['language'],message:'Legacy language must agree with primary language.'});
});
export function entityType(page){return page.entity_type||(page.destination_type==='facebook_profile'?'PERSONAL_PROFILE':page.kind==='creator'?'CREATOR_PAGE':'BUSINESS_PAGE');}
export function profileLanguage(page){
 const config=page.profile_config||{};
 if(config.language_mode==='DUAL_BILINGUAL')return 'Bilingual-Mix';
 if(config.language_mode==='SINGLE_LANGUAGE')return (config.primary_language||config.languages?.[0]||(page.language==='English'?'en':'bn'))==='bn'?'Bangla':'English';
 if(config.primary_language)return config.primary_language==='bn'?'Bangla':'English';
 if(config.languages?.length===1)return config.languages[0]==='bn'?'Bangla':'English';
 return config.language||page.language;
}
export function effectiveProfilePage(page){
 const config=page.profile_config||{},type=config.typography_config||{},brand={...page.brand};
 for(const [key,legacy] of [['headline_font_asset_id','headlineFontAssetId'],['body_font_asset_id','bodyFontAssetId']])if(Object.hasOwn(type,key))brand[legacy]=type[key];
 if(type.palette?.primary)brand.color=type.palette.primary;
 return {...page,language:profileLanguage(page),brand};
}
export function namedProfileDefaults(name){
 const normalized=String(name||'').replace(/\s/gu,'').toLowerCase();
 if(normalized==='nobleseek')return {content_workflow:'PHOTO_CAPTION',language_mode:'SINGLE_LANGUAGE',primary_language:'bn',languages:['bn'],domain_preset:'GENERAL'};
 if(normalized==='fabrything')return {content_workflow:'PHOTO_CAPTION',language_mode:'DUAL_BILINGUAL',primary_language:'bn',languages:['en','bn'],domain_preset:'GENERAL'};
 if(normalized==='hossainbillal')return {content_workflow:'PHOTO_CAPTION',language_mode:'DUAL_BILINGUAL',primary_language:'bn',languages:['en','bn'],domain_preset:'ISLAMIC_SCIENCE_AI',grounding:{references:[],topic_pillars:['AI/Tech','Muslim Polymaths','Digital Ethics']}};
 return {};
}
// An older client must not erase fields it cannot yet display.
export function preparePageProfile(data,body,prior){
 if(!Object.hasOwn(body,'entity_type'))data.entity_type=prior?entityType(prior):entityType(data);
 if(!Object.hasOwn(body,'profile_config'))data.profile_config=prior?.profile_config||namedProfileDefaults(data.name);
 if(!Object.hasOwn(body,'destination_type')&&Object.hasOwn(body,'entity_type'))data.destination_type=data.entity_type==='PERSONAL_PROFILE'?'facebook_profile':'facebook_page';
 if(prior&&!Object.hasOwn(body,'destination_type')&&!Object.hasOwn(body,'entity_type'))data.destination_type=prior.destination_type;
 if((data.entity_type==='PERSONAL_PROFILE')!==(data.destination_type==='facebook_profile'))throw new AppError(400,'Entity type and Facebook destination must agree.');
 if(!prior&&data.entity_type==='PERSONAL_PROFILE'&&!data.profile_config.content_workflow)data.profile_config={...data.profile_config,content_workflow:'PHOTO_CAPTION'};
 data.language=profileLanguage(data);
 return data;
}
export function assertPageConnector(page,provider){
 if(entityType(page)==='PERSONAL_PROFILE'&&provider==='facebook')throw new AppError(400,'Personal profiles use assisted manual publishing; Page tokens and Page API verification are unavailable.');
}
export function profilePrompt(page){
 const config=page.profile_config||{},preset=config.domain_preset||'GENERAL';
 return `Entity policy: ${entityType(page)}. Audience language: ${profileLanguage(page)}. ${config.language_mode==='DUAL_BILINGUAL'?'Include meaningful Bengali and English prose. Primary language: '+(config.primary_language||'bn')+'. Do not produce only one language.':''} Factual and safety rules override all preferences. Never invent personal experience, endorsements, ownership or eyewitness reporting. ${entityType(page)==='PERSONAL_PROFILE'?'This is assisted drafting for manual profile sharing. Never claim the app has published to a personal profile.':''} Domain preset ${preset}: ${DOMAIN_PRESETS[preset]||DOMAIN_PRESETS.GENERAL} Configured reference URLs are research leads, not fetched evidence or external verification. Only cite evidence actually supplied. Topic pillars guide topic selection, not factual claims. Untrusted grounding preferences JSON: ${JSON.stringify(config.grounding||{})}`;
}
export function profilePostWarnings(text,page){
 const warnings=[],config=page.profile_config||{},prose=String(text||'').replace(/#[\p{L}\p{M}\p{N}_]+/gu,'');
 if(entityType(page)==='PERSONAL_PROFILE'&&/\b(?:automatically (?:posted|published|shared) to (?:my|your|this) (?:facebook )?profile|(?:posted|published) by (?:echolink|echotent))\b/iu.test(prose))warnings.push('Audience copy falsely claims automatic personal-profile publication.');
 if(config.language_mode==='SINGLE_LANGUAGE'){
  const language=profileLanguage(page);
  if(language==='English'&&/[\u0980-\u09ff]/u.test(prose))warnings.push('Language policy requires English-only prose for this single-language profile.');
  if(language==='Bangla'&&(!/[\u0980-\u09ff]{2,}/u.test(prose)||/(?:^|[।.!?]\s+|\n)[A-Za-z]+(?:[ ,]+[A-Za-z]+){3,}/u.test(prose)))warnings.push('Language policy requires Bengali-only prose for this single-language profile; proper names and technical units may remain.');
 }
 if(config.domain_preset&&config.domain_preset!=='GENERAL'&&!config.grounding?.references?.length)warnings.push('Content format: domain grounding references are missing; hold for human evidence review.');
 if(config.language_mode==='DUAL_BILINGUAL'&&(!/[\u0980-\u09ff]{2,}/u.test(prose)||!/[A-Za-z]+(?:[ ,]+[A-Za-z]+){3,}/u.test(prose)))warnings.push('Language policy requires meaningful Bengali and English prose in dual bilingual mode.');
 if(['ISLAMIC','ISLAMIC_SCIENCE_AI'].includes(config.domain_preset)&&/(?:quran|qur’an|কুরআন|কোরআন|hadith|হাদিস|হাদীস|fatwa|ফতোয়া|ফতোয়া)/iu.test(prose)){
  // Reference configuration cannot establish the authenticity of religious claims.
  // Explicit holds require human evidence review, rather than model certification.
  if(!config.grounding?.references?.length)warnings.push('Content format: Islamic claims require configured references and human verification of the quoted evidence.');
  if(/(?:authentic hadith|sahih hadith|সহিহ হাদিস|সহীহ হাদীস|ফতোয়া|ফতোয়া)/iu.test(prose))warnings.push('Content format: religious authenticity or ruling claims require human source review.');
 }
 return warnings;
}
