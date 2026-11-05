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
