import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {inspectFont,fontOptions,FONT_MAX_BYTES} from '../server/fonts.mjs';
import {renderNewsCreative} from '../server/news-design.mjs';
const file=new URL('../assets/fonts/NotoSansBengali.ttf',import.meta.url);
test('Unicode font validation rejects disguised, corrupt and oversize uploads and detects Bangla glyphs',async()=>{
 const bytes=await readFile(file),info=inspectFont(bytes);assert.equal(info.family,'Noto Sans Bengali');assert.equal(info.supportsBangla,true);
 for(const invalid of [Buffer.from('<svg onload="evil"/>'),bytes.subarray(0,32),Buffer.alloc(FONT_MAX_BYTES+1)])assert.throws(()=>inspectFont(invalid),e=>e.status===400);
});
test('headline and body font choices stay independent and their actual font file reaches image rendering',async()=>{
 const page={name:'বাংলা সংবাদ',language:'Bangla',brand:{},designFonts:{headline:{family:'Noto Sans Bengali',path:fileURLToPath(file)}},creative_policy:{}};
 assert.equal(fontOptions(page,'headline',44).fontfile,fileURLToPath(file));assert.equal(fontOptions(page,'body',20,'Georgia').font,'Georgia 20');
 const result=await renderNewsCreative({page,post:{title:'বাংলা সংবাদের নতুন শিরোনাম',seo:{},creative:{}},width:1080,height:1350});assert(result.bytes.length>10000);assert.equal(result.height,1350);
});
