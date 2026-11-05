import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
import {renderCreative,ratios} from '../server/creative.mjs';
test('creative exports preserve source pixels and selected aspect ratios',async()=>{
 const sourcePhoto=await sharp({create:{width:500,height:600,channels:3,background:'#186ca0'}}).png().toBuffer();
 for(const ratio of Object.keys(ratios)){
  const image=await renderCreative({page:{name:'Test Studio',brand:{name:'Test Studio',color:'#ff826b'}},post:{title:'Cotton essentials',creative:{ratio,style:'editorial',cta:'Explore the collection'}},product:{title:'Cotton essentials',price:49.5,currency:'USD'},sourcePhoto});
  const metadata=await sharp(image.bytes).metadata();assert.equal(metadata.width,ratios[ratio][0]);assert.equal(metadata.height,ratios[ratio][1]);assert.equal(image.sourcePhotoUsed,true);assert.equal(metadata.format,'jpeg');
  const pixel=await sharp(image.bytes).extract({left:Math.round(image.width*.7),top:Math.round(image.height*.35),width:1,height:1}).raw().toBuffer();assert(pixel[2]>pixel[0]+40,'product photo remains visible without recoloring');
  const dir=new URL('../.local/verification/',import.meta.url);await mkdir(dir,{recursive:true});await writeFile(new URL('creative-'+ratio.replace(':','x')+'.jpg',dir),image.bytes);
 }
});
test('transparent black logos stay visible on a white badge in a dark creative',async()=>{
 const logo=await sharp({create:{width:100,height:100,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:30,height:30,channels:3,background:'#000000'}}).png().toBuffer(),left:35,top:35}]).png().toBuffer();
 const image=await renderCreative({page:{name:'Brand',brand:{name:'Brand',color:'#000000'}},post:{title:'Product',creative:{ratio:'1:1',style:'editorial'}},brandLogo:logo});
 const white=await sharp(image.bytes).extract({left:90,top:55,width:1,height:1}).raw().toBuffer(),black=await sharp(image.bytes).extract({left:110,top:80,width:1,height:1}).raw().toBuffer();
 assert(white[0]>230&&white[1]>230&&white[2]>230,'transparent interior is flattened onto white');assert(black[0]<30,'the real black artwork remains black');
});
