import test from 'node:test';
import assert from 'node:assert/strict';
import {readFabrythingCatalog} from '../server/fabrything.mjs';
import {captionLanguageWarnings} from '../server/caption-generation.mjs';
const site={url:'https://store.example'},catalog=Array.from({length:205},(_,i)=>({id:i+1,name:'Product '+(i+1),slug:'product-'+(i+1),stock:2,image:[],initial_selling_price:50}));
const database=async(_c,_s,run)=>run({query:async(sql,args)=>{
 if(!sql.startsWith('SELECT'))return {rows:[]};
 assert.match(sql,/p\.id::text=\$1/);assert.match(sql,/ANY\(\$2::text\[\]\)/);assert.match(sql,/updated_at DESC,p.id DESC/);
 return {rows:catalog.filter(p=>(args[0]===null||String(p.id)===args[0])&&!args[1].includes(String(p.id))).slice(0,100)};
}},{schema:'public'});
test('successive catalogue batches retain source history and never repeat an imported ID',async()=>{
 const first=await readFabrythingCatalog({}, {},site,{}, {database});
 const second=await readFabrythingCatalog({}, {},site,{excludeIds:first.map(p=>String(p.id))},{database});
 assert.equal(first.length,100);assert.equal(second.length,100);assert(!second.some(p=>first.some(a=>a.id===p.id)));
 const last=await readFabrythingCatalog({}, {},site,{excludeIds:[...first,...second].map(p=>String(p.id))},{database});assert.equal(last.length,5);
});
test('publication availability can read one saved product outside the first hundred',async()=>{
 const found=await readFabrythingCatalog({}, {},site,{externalId:205},{database});assert.equal(found.length,1);assert.equal(found[0].id,205);assert.equal(found[0].available,true);
 assert.equal((await readFabrythingCatalog({}, {},site,{externalId:'205 OR true'},{database})).length,0);
});
test('a tool marker embedded in Bengali copy cannot pass as audience text',()=>{
 assert.match(captionLanguageWarnings('পণ্য সম্পর্কে আমাদের ও<tool_call>েবসাইট দেখুন।',{language:'Bilingual-Mix'})[0],/internal model marker/);
});
