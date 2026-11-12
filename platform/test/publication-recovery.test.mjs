import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {writeNoble,verifyNoblePublic} from '../server/nobleseek.mjs';
import {publicationFailure} from '../server/publication-state.mjs';
import {newsHeadline,renderNewsCreative} from '../server/news-design.mjs';
import {nextSlot} from '../server/scheduling.mjs';
const post={id:'11111111-1111-4111-8111-111111111111',title:'আজকের সংবাদ গুরুত্বপূর্ণ নতুন তথ্য',caption:'নিশ্চিত তথ্যের বিবরণ। #বাংলাদেশ',source_url:'https://example.com/news',creative:{},seo:{}};
const columns=['id','content_type','headline','slug','status'].map(column_name=>({column_name,is_nullable:'NO',column_default:null,is_identity:column_name==='id'?'YES':'NO'}));
test('website inserts NEWS into the required content_type and rejects schema drift before submission',async()=>{
 let submitted=0,inserted;
 const database=async(c,s,fn)=>fn({query:async(sql,values)=>{if(sql.startsWith('SELECT column_name'))return {rows:columns};inserted={sql,values};return {rowCount:1,rows:[{slug:'echolink-'+post.id,status:'PUBLISHED'}]};}},{schema:'public'});
 const result=await writeNoble({}, {},{url:'https://nobleseek.fabrything.com',config:{}},post,{database,onWrite:()=>submitted++});assert.equal(submitted,1);assert(inserted.sql.includes('"content_type"'));assert(inserted.values.includes('NEWS'));assert.equal(result.slug,'echolink-'+post.id);
 const drift=async(c,s,fn)=>fn({query:async()=>({rows:[...columns,{column_name:'new_required_field',is_nullable:'NO',is_identity:'NO'}]})},{schema:'public'});await assert.rejects(()=>writeNoble({},{},{url:'https://example.com',config:{}},post,{database:drift,onWrite:()=>submitted++}),/new_required_field/);assert.equal(submitted,1);
});
test('definite SQL rejection is retryable, lost submissions are held, confirmed website is preserved',()=>{
 const sql=Object.assign(new Error('private database detail'),{code:'23502',column:'content_type'}),f=publicationFailure(sql,{websiteSubmitted:true});assert.equal(f.unknown,false);assert.match(f.message,/23502, content_type/);assert.doesNotMatch(f.message,/private/);
 assert.equal(publicationFailure(new Error(),{websiteSubmitted:true}).unknown,true);assert.equal(publicationFailure(Object.assign(new Error('Token rejected'),{status:401}),{stage:'facebook'}).destination,'facebook');
 assert.equal(publicationFailure(Object.assign(new Error('Rejected'),{definiteRejection:true,status:400}),{websiteConfirmed:true,facebookSubmitted:true}).unknown,false);
 const partial=publicationFailure(Object.assign(new Error('Expired token'),{status:401}),{websiteConfirmed:true});assert.equal(partial.unknown,false);assert.match(partial.message,/Website article is confirmed/);
});
test('public website verification requires the exact article, not an HTML or unrelated success response',async()=>{
 const site={url:'https://nobleseek.fabrything.com'};await verifyNoblePublic(site,'story',{request:async url=>{assert.equal(new URL(url).pathname,'/api/store/nobleseek/articles/story/');return {data:{slug:'story'}};}});await assert.rejects(()=>verifyNoblePublic(site,'story',{request:async()=>({data:{slug:'other'}})}),/exact article/);
});
test('news uses explicit colored words safely and renders the dark reference composition',async()=>{
 const headline=newsHeadline({...post,creative:{highlight:'গুরুত্বপূর্ণ',highlightColor:'#ffdd22'}});assert.equal(headline.highlight,'গুরুত্বপূর্ণ');assert(headline.markup.includes('foreground="#ffdd22"'));assert(!newsHeadline({...post,title:'<b>Unsafe</b>'}).markup.includes('<b>'));
 const image=await renderNewsCreative({post,page:{name:'NobleSeek',language:'Bangla',brand:{},creative_policy:{websiteLabel:'nobleseek.fabrything.com'}},width:1080,height:1350});assert.equal(image.designVersion,'studio-v8');assert.equal((await sharp(image.bytes).metadata()).height,1350);const pixel=await sharp(image.bytes).extract({left:400,top:10,width:1,height:1}).raw().toBuffer();assert(pixel[0]<25&&pixel[1]<25);
});
test('interval scheduling uses the minimum gap instead of the spread grid',async()=>{
 const page={id:'p',timezone:'UTC',window_start:'00:00',window_end:'00:00',daily_cap:100,gap_minutes:5,creative_policy:{scheduleMode:'interval'}},from=new Date('2026-11-07T07:03:00Z');const db={query:async()=>({rows:[{at:'2026-11-07T07:01:00Z',status:'published'}]})};assert.equal((await nextSlot(db,'w',page,{from,spread:true,target:100})).toISOString(),'2026-11-07T07:06:00.000Z');
});
import {prepareCaption} from '../server/prompts.mjs';
test('public captions remove echoed Page instructions without deleting source facts',()=>{
 const instruction='স্বাভাবিক, প্রাঞ্জল বাংলায় সংক্ষিপ্ত অথচ তথ্যসমৃদ্ধ সংবাদ। সূত্রের নাম ও তথ্য অপরিবর্তিত রেখে নিজস্ব ভাষায় লিখুন।';const {caption,notes}=prepareCaption('চালের দাম বেড়েছে।\n\n'+instruction+'\n\nবস্তাপ্রতি দাম বেড়েছে ২৫ টাকা।',{creative_policy:{captionInstructions:instruction}});assert.equal(caption,'চালের দাম বেড়েছে।\n\nবস্তাপ্রতি দাম বেড়েছে ২৫ টাকা।');assert(notes.length);
});
import {publishGate} from '../server/scheduling.mjs';
test('execution checks actual delivered spacing while planned future slots stay reserved',async()=>{
 const page={id:'p',active:true,timezone:'UTC',window_start:'00:00',window_end:'00:00',daily_cap:100,gap_minutes:5},post={id:'one',version:1,approved_version:1},now=new Date('2026-11-07T08:00:03Z');const db={query:async()=>({rows:[{at:'2026-11-07T08:05:00Z',status:'scheduled'}]})};await assert.rejects(()=>publishGate(db,'w',page,post,{now}),e=>e.code==='posting_gap');await publishGate(db,'w',page,post,{now,execution:true});await assert.rejects(()=>publishGate({query:async()=>({rows:[{at:'2026-11-07T07:58:00Z',status:'published'}]})},'w',page,post,{now,execution:true}),e=>e.code==='posting_gap');
 assert.equal(publicationFailure(Object.assign(new Error(),{code:'23505'}),{facebookSubmitted:true,facebookConfirmed:true}).unknown,true);
});
