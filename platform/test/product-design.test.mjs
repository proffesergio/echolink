import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {analyzeProduct} from '../server/product-analysis.mjs';
import {renderCreative} from '../server/creative.mjs';
import {inspectProductPhoto,prepareProductPhoto} from '../server/product-photo.mjs';
import {backgroundPrompt} from '../server/prompts.mjs';

test('catalogue identity selects different kidswear, denim, polo, womenswear and device directions',()=>{
 const items=[['Kids T-Shirt','kidswear'],['Raw denim jeans','denim'],['Cotton polo','polo'],['Women’s embroidered kurti','womenswear'],['65 W USB-C charger','technical'],['Rechargeable desk fan','technical']];
 for(const [title,key]of items)assert.equal(analyzeProduct({title}).design.key,key);
 const toy=analyzeProduct({title:'Dancing cactus toy',attributes:{category:'Baby & Mom Care'}});assert.equal(toy.type,'toy');
 const fan=analyzeProduct({title:'Desk fan',description:'Charging time 3 hours. 2400 RPM.',attributes:{color:'Black',collection:'2026',runtime:'No documentation'}});assert.deepEqual(fan.callouts.map(c=>c.key),['rpm']);
 assert.doesNotMatch(JSON.stringify(fan.callouts),/Black|2026|3 hours|No documentation/);
});

test('alpha validation retains pale product pixels and rejects empty or barely transparent masks',async()=>{
 const original=await sharp({create:{width:400,height:500,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:220,height:360,channels:3,background:'#fffefb'}}).png().toBuffer(),left:90,top:70}]).png().toBuffer();
 const photo=await prepareProductPhoto(original);assert.equal(photo.mode,'isolated-product');assert(photo.quality.bounds.width>=220);assert(photo.quality.bounds.height>=360);
 const pixel=await sharp(photo.bytes).extract({left:110,top:180,width:1,height:1}).raw().toBuffer();assert(pixel[0]>250&&pixel[3]===255);
 const opaque=await sharp({create:{width:400,height:500,channels:4,background:'#fffefb'}}).png().toBuffer();assert.equal((await inspectProductPhoto(opaque)).usableCutout,false);assert.equal((await prepareProductPhoto(opaque)).mode,'original-photo-panel');
 const empty=await sharp({create:{width:400,height:500,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();assert.equal((await inspectProductPhoto(empty)).usableCutout,false);
});

test('category-aware creatives preserve colour and aspect, keep type inside the canvas and omit prices and supplier headings',async()=>{
 const sourcePhoto=await sharp({create:{width:500,height:700,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:300,height:520,channels:3,background:'#186ca0'}}).png().toBuffer(),left:100,top:90}]).png().toBuffer();
 for(const title of ['Fabrilife Premium Cotton Polo','Kids Premium T-Shirt','Denim Jeans','Women’s Kurti','Rechargeable Desk Fan']){
  const product={title,price:1200,description:'100% cotton. Regular fit. 175 GSM. 5000 mAh. Runtime: up to 8 hours. 2400 RPM.',attributes:{brand:'Fabrilife'}},image=await renderCreative({post:{title,creative:{ratio:'4:5'}},page:{name:'Fabrything',brand:{},creative_policy:{websiteLabel:'fabrything.com',facebookHandle:'fabrything',instagramHandle:'fabrything'}},product,sourcePhoto});
  assert.equal(image.designVersion,'product-v7');assert.equal(image.photoMode,'isolated-product');assert(image.heroBounds.height/image.heroBounds.width>1.6);assert.doesNotMatch(image.visibleText.join(' '),/Fabrilife|PRODUCT EDIT|1200|COLOUR|COLLECTION/iu);
  for(const b of image.textBounds)assert(b.left>=0&&b.top>=0&&b.left+b.width<=image.width&&b.top+b.height<=image.height,JSON.stringify(b));
  if(image.analysis.design.descriptor){const b=image.textBounds.find(b=>b.text===image.analysis.design.descriptor),pixel=await sharp(image.bytes).extract({left:b.left+2,top:b.top+2,width:1,height:1}).raw().toBuffer();assert(pixel[0]>180,'faint background lettering must not create an opaque black rectangle');}
  const p=await sharp(image.bytes).extract({left:image.heroBounds.left+Math.floor(image.heroBounds.width/2),top:image.heroBounds.top+Math.floor(image.heroBounds.height/2),width:1,height:1}).raw().toBuffer();assert(p[2]>p[0]+40);
 }
});

test('AI backdrop direction uses the product subcategory without asking the model to redraw it',()=>{
 const prompt=backgroundPrompt({niche:'Ecommerce',creative_policy:{}},{type:'product_sale'},{title:'Kids cotton T-Shirt',description:'175 GSM cotton'});
 assert.match(prompt,/Kidswear|kidswear/);assert.match(prompt,/No products, text/);assert.match(prompt,/Do not redraw, recolor, stretch/);assert.match(prompt,/175 GSM/);
});
