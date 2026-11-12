import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {inspectFont,fontOptions,FONT_MAX_BYTES} from '../server/fonts.mjs';
import {renderNewsCreative} from '../server/news-design.mjs';
import sharp from 'sharp';
const file=new URL('../assets/fonts/NotoSansBengali.ttf',import.meta.url);
test('real WOFF and WOFF2 retain Unicode shaping in the server renderer',async()=>{
 for(const extension of ['woff','woff2']){
  const file=new URL('./fixtures/fonts/NotoSansBengali.'+extension,import.meta.url),bytes=await readFile(file),info=inspectFont(bytes);
  assert.equal(info.mime,'font/'+extension);assert(info.supportsBangla);
  const image=await sharp({text:{text:'বাংলা সংবাদ',font:info.family+' 32',fontfile:fileURLToPath(file),width:500,rgba:true}}).png().toBuffer();assert(image.length>500);
  const bomb=Buffer.from(bytes);bomb.writeUInt32BE(50000000,16);assert.throws(()=>inspectFont(bomb),e=>e.status===400);
 }
});
test('Unicode font validation rejects disguised, corrupt and oversize uploads and detects Bangla glyphs',async()=>{
 const bytes=await readFile(file),info=inspectFont(bytes);assert.equal(info.family,'Noto Sans Bengali');assert.equal(info.supportsBangla,true);
 for(const invalid of [Buffer.from('<svg onload="evil"/>'),bytes.subarray(0,32),Buffer.alloc(FONT_MAX_BYTES+1)])assert.throws(()=>inspectFont(invalid),e=>e.status===400);
});
test('headline and body font choices stay independent and their actual font file reaches image rendering',async()=>{
 const page={name:'বাংলা সংবাদ',language:'Bangla',brand:{},website_publishing:true,designFonts:{headline:{family:'Noto Sans Bengali',path:fileURLToPath(file)}},creative_policy:{linkComments:{enabled:true}}};
 assert.equal(fontOptions(page,'headline',44).fontfile,fileURLToPath(file));assert.equal(fontOptions(page,'body',20,'Georgia').font,'Georgia 20');
 const result=await renderNewsCreative({page,post:{title:'বাংলা সংবাদের নতুন শিরোনাম',seo:{},creative:{}},width:1080,height:1350});assert(result.bytes.length>10000);assert.equal(result.height,1350);assert(result.visibleText.includes('বিস্তারিত জানতে প্রথম কমেন্ট দেখুন'));
});
