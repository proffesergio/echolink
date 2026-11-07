import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {channelDirection,instagramCaption} from '../server/channel-captions.mjs';
import {captionPrompt,prepareCaption} from '../server/prompts.mjs';
import {logoAssetFor,productLogo} from '../server/brand.mjs';
import {shortProductTitle,renderProductCreative} from '../server/product-design.mjs';
import {validate} from '../server/validation.mjs';
test('channel styles vary presentation while sharing the same facts and language rules',()=>{
 const page={name:'Store',language:'Bilingual-Mix',creative_policy:{channelCaptions:{facebook:{style:'editorial',instructions:'Explain the fabric.'},instagram:{style:'concise',instructions:'Keep a visual opening.'}}}},post={type:'product_sale'},product={title:'Cotton polo',description:'Cotton fabric',attributes:{material:'Cotton'}};
 const fb=captionPrompt(page,post,product),ig=captionPrompt(page,post,product,null,'instagram');assert.deepEqual(fb.facts,ig.facts);assert.match(fb.prompt,/Explain the fabric/);assert.doesNotMatch(fb.prompt,/Keep a visual opening/);assert.match(ig.prompt,/Destination: instagram/);assert.match(ig.prompt,/Keep a visual opening/);assert.match(ig.prompt,/bilingual Bangla and English/);
 assert.equal(instagramCaption({caption:'FB',seo:{channelCaptions:{instagram:'IG'}}}),'IG');assert.equal(instagramCaption({caption:'FB',seo:{channelCaptions:{instagram:''}}}),'FB');assert.match(channelDirection(page,'facebook'),/same names/);
});
test('logo selection uses optional contrast variants and adaptive marks preserve transparency',async()=>{
 const page={kind:'ecommerce',brand:{logoAssetId:'base',logoLightAssetId:'light',logoDarkAssetId:'dark'}};assert.equal(logoAssetFor(page,{title:'Cotton polo',attributes:{brand:'Fabrilife'}}),'light');assert.equal(logoAssetFor(page,{attributes:{brand:'Other'}}),'dark');
 const logo=await sharp({create:{width:100,height:100,channels:4,background:'#00000000'}}).composite([{input:Buffer.from('<svg width="100" height="100"><path d="M10 10h80v80H10zM30 30v40h40V30z" fill="black" fill-rule="evenodd"/></svg>')}]).png().toBuffer();
 for(const dark of [true,false]){const result=await productLogo(logo,{dark,mode:'adaptive',width:100}),{data,info}=await sharp(result).raw().toBuffer({resolveWithObject:true}),middle=(Math.floor(info.height/2)*info.width+Math.floor(info.width/2))*4;assert(info.width<=100&&info.height<=65,'final alpha composition respects the selected size');assert.equal(data[middle+3],0,'transparent logo opening stays transparent');const stats=await sharp(result).stats();assert(Math.abs(stats.channels[0].max-(dark?255:23))<=3,'resized mark retains the intended contrast color');}
 const opaque=await sharp({create:{width:30,height:30,channels:3,background:'#bb2200'}}).png().toBuffer(),kept=await sharp(await productLogo(opaque,{dark:true,mode:'adaptive'})).stats();assert.equal(kept.channels[0].max,187,'opaque artwork is preserved rather than turned into a featureless color block');
});
test('product design removes extra branding, shortens headlines and shows the centered website',async()=>{
 const title='Fabrilife Premium Quality Mens Cotton Polo Shirt (Midnight Blue)';assert(shortProductTitle(title).length<=58);assert.doesNotMatch(shortProductTitle(title),/Fabrilife|Premium Quality|Midnight Blue/i);
 const image=await renderProductCreative({post:{title,creative:{ratio:'1:1'}},page:{name:'Fabrything',brand:{},creative_policy:{websiteLabel:'fabrything.com',facebookHandle:'fabrything',instagramHandle:'fabrything'}},product:{title,attributes:{brand:'Fabrilife'}},width:1080,height:1080});assert.equal(image.designVersion,'studio-v5');assert.doesNotMatch(image.visibleText.join(' '),/PRODUCT EDIT|FABRILIFE|Fabrything/);assert(image.visibleText.includes('www.fabrything.com'));assert.equal(image.visibleText.filter(t=>t==='@fabrything').length,2);
});
test('Page validation accepts independent channel settings and bounded logo sizes',()=>{
 const page={name:'Shop',niche:'Fashion',kind:'ecommerce',language:'Bilingual-Mix',creative_policy:{channelCaptions:{instagram:{style:'concise',instructions:'Short visual story.'}}},brand:{logoMode:'adaptive',logoLightWidth:120,logoDarkWidth:90}};
 assert.equal(validate('page',page).brand.logoLightWidth,120);assert.throws(()=>validate('page',{...page,brand:{logoLightWidth:900}}));assert.throws(()=>validate('page',{...page,creative_policy:{channelCaptions:{tiktok:{style:'concise'}}}}));
});
test('bilingual product variants include Bangla and discard unrelated-language model lines',()=>{
 const page={name:'Shop',language:'Bilingual-Mix'},product={title:'Cotton polo',description:'Soft organic cotton fabric'};
 const result=prepareCaption('Organic cotton polo with a soft feel and regular fit. Message us for product details.\n想 узнать больше о деталях этого поло? Send us a message!',page,product);assert.match(result.caption,/[\u0980-\u09ff]/u);assert.match(result.caption,/Organic cotton/);assert.doesNotMatch(result.caption,/узнать|想/);assert.equal(result.notes.length,2);
});
