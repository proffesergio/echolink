import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {profileConfigSchema,entityType,preparePageProfile,effectiveProfilePage,namedProfileDefaults,assertPageConnector,profilePostWarnings} from '../server/profile-config.mjs';
import {validate} from '../server/validation.mjs';
import {captionPrompt} from '../server/prompts.mjs';
import {captionLanguageWarnings,generateFactualCaption} from '../server/caption-generation.mjs';
import {profileFontChoice} from '../server/fonts.mjs';
import {applyProfileRendering} from '../server/creative.mjs';
import sharp from 'sharp';
import {criticalEditorialWarnings} from '../server/editorial.mjs';
const base={name:'Example',niche:'education',kind:'education',language:'English'},font='11111111-1111-4111-8111-111111111111';
const page=(extra={})=>validate('page',{...base,...extra});
test('entity defaults preserve historical destinations and distinguish creator Pages',()=>{
 for(const [input,expected] of [[{},'BUSINESS_PAGE'],[{kind:'creator'},'CREATOR_PAGE'],[{destination_type:'facebook_profile'},'PERSONAL_PROFILE']]){
  const body={...base,...input},data=preparePageProfile(page(input),body);assert.equal(data.entity_type,expected);
 }
 assert.equal(entityType({destination_type:'facebook_profile'}),'PERSONAL_PROFILE');
});
test('explicit personal entities derive manual destination and reject contradictory destinations',()=>{
 const body={...base,entity_type:'PERSONAL_PROFILE'};assert.equal(preparePageProfile(validate('page',body),body).destination_type,'facebook_profile');
 assert.throws(()=>preparePageProfile(page({entity_type:'PERSONAL_PROFILE'}),{...body,destination_type:'facebook_page'}),/must agree/);
 assert.throws(()=>page({entity_type:'OTHER'}),e=>e.status===400);
});
test('older Page updates preserve profile config and entity without cross-Page mutation',()=>{
 const prior={...base,entity_type:'PERSONAL_PROFILE',destination_type:'facebook_profile',profile_config:{language_mode:'SINGLE_LANGUAGE',primary_language:'en',languages:['en']}};
 const data=preparePageProfile(page(),base,prior);assert.deepEqual(data.profile_config,prior.profile_config);assert.equal(data.destination_type,'facebook_profile');assert.equal(data.entity_type,'PERSONAL_PROFILE');
 assert.deepEqual(preparePageProfile(page({profile_config:{}}),{...base,profile_config:{}},prior).profile_config,{});
 const other=preparePageProfile(page(),base);assert.deepEqual(other.profile_config,{});assert.equal(other.entity_type,'BUSINESS_PAGE');
});
test('profile schema bounds language, typography and style and rejects unknown settings',()=>{
 assert.deepEqual(profileConfigSchema.parse({}),{});
 for(const config of [{language:'Klingon'},{typography_config:{headline_font_asset_id:'bad'}},{typography_config:{fontfile:'/etc/passwd'}},{grounding:{topic_pillars:['x'.repeat(201)]}},{token:'private'},{publishing:'automatic'}])assert.equal(profileConfigSchema.safeParse(config).success,false);
 assert.equal(preparePageProfile(page({profile_config:{language_mode:'SINGLE_LANGUAGE',primary_language:'bn'}}),{...base,profile_config:{language_mode:'SINGLE_LANGUAGE',primary_language:'bn'}}).language,'Bangla');
});
test('language modes enforce consistent language sets and primary language',()=>{
 for(const config of [{language_mode:'SINGLE_LANGUAGE',languages:['bn','en']},{language_mode:'DUAL_BILINGUAL',languages:['bn']},{primary_language:'en',languages:['bn']},{languages:['en','en']},{language_mode:'OTHER'}])assert.equal(profileConfigSchema.safeParse(config).success,false);
 assert(profileConfigSchema.safeParse({language_mode:'DUAL_BILINGUAL',primary_language:'bn',languages:['en','bn']}).success);
});
test('grounding URLs remain public HTTPS research leads, not verified facts',()=>{
 for(const references of [['http://example.com'],['https://localhost'],['https://metadata.google.internal'],['https://user:secret@example.com']])assert.equal(profileConfigSchema.safeParse({grounding:{references}}).success,false);
 const p={...base,profile_config:{domain_preset:'ISLAMIC_SCIENCE_AI',grounding:{references:[]}}};assert(criticalEditorialWarnings(profilePostWarnings('Digital ethics and AI.',p)).length);
 assert.deepEqual(profilePostWarnings('Digital ethics and AI.',{...p,profile_config:{domain_preset:'AI',grounding:{references:['https://example.com']}}}),[]);
});
test('profile typography merges per role without modifying brand or neighboring Pages',()=>{
 const source={...base,brand:{headlineFontAssetId:font,bodyFontAssetId:font,color:'#123456'},profile_config:{typography_config:{headline_font_asset_id:null}}};
 const applied=effectiveProfilePage(source);assert.equal(applied.brand.headlineFontAssetId,null);assert.equal(applied.brand.bodyFontAssetId,font);assert.equal(applied.brand.color,'#123456');assert.equal(source.brand.headlineFontAssetId,font);
});
test('all caption prompt branches enforce entity policy and bound style as data',()=>{
 for(const compact of [true,false])for(const language of ['Bangla','English','Bilingual-Mix'])for(const product of [null,{title:'Chair',description:'Wooden chair',attributes:{}}]){
  const p={...base,language,entity_type:'PERSONAL_PROFILE',creative_policy:{},profile_config:{language,domain_preset:'ISLAMIC_SCIENCE_AI',grounding:{topic_pillars:['Digital Ethics']}}};
  const prompt=captionPrompt(p,{title:'Learning',type:product?'product_sale':'original',body:'A useful lesson.'},product,null,'facebook',{compact});
  assert.match(prompt.system,/PERSONAL_PROFILE/);assert.match(prompt.system,/manual profile sharing/);assert.match(prompt.system,/Never invent personal experience/);assert.match(prompt.system,/Digital Ethics/);assert.match(prompt.system,/not fetched evidence/);
 }
});
test('personal connectors fail before any Page authorization; text/image connections remain available',()=>{
 const p={entity_type:'PERSONAL_PROFILE'};assert.throws(()=>assertPageConnector(p,'facebook'),/assisted manual publishing/);assert.doesNotThrow(()=>assertPageConnector(p,'ollama'));assert.doesNotThrow(()=>assertPageConnector({entity_type:'CREATOR_PAGE'},'facebook'));
});
test('effective language and false profile publication claims become blocking post warnings',()=>{
 assert(captionLanguageWarnings('বাংলা সংবাদের বিস্তারিত এখানে।',{...base,language:'Bangla',profile_config:{language:'English'}}).length);
 const warnings=captionLanguageWarnings('Automatically published to your Facebook profile.',{...base,entity_type:'PERSONAL_PROFILE'});assert(criticalEditorialWarnings(warnings).length);
});
test('profile violations use the bounded correction pass and remain held if unresolved',async()=>{
 let calls=0;const result=await generateFactualCaption({page:{...base,entity_type:'PERSONAL_PROFILE'},post:{type:'original',title:'Lesson',body:'A useful lesson.'},connection:{}},{complete:async()=>{calls++;return 'Automatically published to your Facebook profile.';}});
 assert.equal(calls,2);assert.equal(result.needsCorrection,true);
});
test('018 migration backfills per existing destination, retains scoped pages and has no delivery writes',async()=>{
 const sql=await readFile(new URL('../sql/018-profile-config.sql',import.meta.url),'utf8');assert.match(sql,/destination_type='facebook_profile' THEN 'PERSONAL_PROFILE'/);assert.match(sql,/kind='creator' THEN 'CREATOR_PAGE'/);assert.match(sql,/jsonb_typeof\(profile_config\)='object'/);assert.match(sql,/CREATE TYPE creator.entity_type AS ENUM/);assert.match(sql,/BEFORE INSERT/);assert(!/UPDATE creator.pages SET (language|profile_config)/.test(sql));assert(!sql.includes("SET DEFAULT 'BUSINESS_PAGE'"));assert(!/creator\.(posts|tasks|connections)|DROP TABLE|DISABLE ROW LEVEL SECURITY/i.test(sql));
});

test('named defaults apply only on creation with absent config; custom profile configs remain intact',()=>{
 for(const [name,mode,preset] of [['Noble Seek','SINGLE_LANGUAGE','GENERAL'],['Fabrything','DUAL_BILINGUAL','GENERAL'],['Hossain Billal','DUAL_BILINGUAL','ISLAMIC_SCIENCE_AI']]){
  const data=preparePageProfile(page({name,destination_type:'facebook_profile'}),{...base,name,destination_type:'facebook_profile'});assert.equal(data.profile_config.language_mode,mode);assert.equal(data.profile_config.domain_preset,preset);assert.equal(data.entity_type,'PERSONAL_PROFILE');
 }
 assert.deepEqual(namedProfileDefaults('Other Personal Profile'),{});
 assert.deepEqual(preparePageProfile(page({name:'Hossain Billal',profile_config:{domain_preset:'GENERAL'}}),{...base,name:'Hossain Billal',profile_config:{domain_preset:'GENERAL'}}).profile_config,{domain_preset:'GENERAL'});
 assert.deepEqual(namedProfileDefaults('Hossain Billal').grounding.topic_pillars,['AI/Tech','Muslim Polymaths','Digital Ethics']);
});
test('explicit language violations and absent grounding are critical warnings',()=>{
 const single={...base,profile_config:{language_mode:'SINGLE_LANGUAGE',primary_language:'bn'}};
 assert(criticalEditorialWarnings(captionLanguageWarnings('This is an English sentence.',single)).length);
 assert.deepEqual(captionLanguageWarnings('বাংলা ভাষায় শেখার সহজ উপায়।',single),[]);
 const dual={...base,profile_config:{language_mode:'DUAL_BILINGUAL',primary_language:'bn',languages:['en','bn']}};
 assert(criticalEditorialWarnings(captionLanguageWarnings('বাংলা ভাষায় শেখার সহজ উপায়।',dual)).length);
 assert.deepEqual(captionLanguageWarnings('বাংলা ভাষায় শেখার সহজ উপায়।\nThis is a useful lesson.',dual),[]);
});
test('requested named fonts use actual assets or disclose safe fallback choices',()=>{
 for(const family of ['Hind Siliguri','SolaimanLipi','Inter','Space Grotesk','JetBrains Mono']){
  const p={...base,profile_config:{typography_config:{headline_font_family:family}}};assert(profileConfigSchema.safeParse(p.profile_config).success);
  const choice=profileFontChoice(p,'headline');assert.equal(choice.family,'sans-serif');assert.equal(choice.requestedFamily,family);assert.equal(choice.fallbackUsed,true);
  const assetChoice=profileFontChoice({...p,designFonts:{headline:{family,path:'/scoped/font.ttf'}}},'headline');assert.equal(assetChoice.fallbackUsed,false);assert.equal(assetChoice.family,family);
 }
});
test('profile rendering applies real palette framing, padding, layout and escaped watermark',async()=>{
 const bytes=await sharp({create:{width:300,height:300,channels:3,background:'#ffffff'}}).png().toBuffer();
 const config={padding:20,palette:{primary:'#ff0000',background:'#0000ff',text:'#00ff00'},watermark:'Example <mark>',layout:'minimal'};
 const result=await applyProfileRendering({bytes,width:300,height:300,designVersion:'fixture'},{...base,profile_config:{typography_config:config}});
 assert(result.profileTypographyApplied);assert(result.visibleText.includes('Example <mark>'));assert.equal(result.designVersion,'fixture');
 const pixels=await sharp(result.bytes).raw().toBuffer({resolveWithObject:true});const at=(x,y)=>Array.from(pixels.data.subarray((y*300+x)*3,(y*300+x)*3+3));assert(at(3,30)[2]>200);assert(at(150,3)[0]>200);assert(at(150,150).every(v=>v>240));
 assert.deepEqual(await applyProfileRendering({bytes,width:300,height:300},base),{bytes,width:300,height:300});
});

test('profile framing preserves existing AI provenance XMP',async()=>{
 const xmp='<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"><Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType></rdf:Description></rdf:RDF></x:xmpmeta>';
 const bytes=await sharp({create:{width:200,height:200,channels:3,background:'#ffffff'}}).withXmp(xmp).jpeg().toBuffer();
 const framed=await applyProfileRendering({bytes,width:200,height:200},{...base,profile_config:{typography_config:{padding:16}}});
 const metadata=await sharp(framed.bytes).metadata();assert(metadata.xmp);assert.match(metadata.xmp.toString(),/compositeWithTrainedAlgorithmicMedia/);
});
