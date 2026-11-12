import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {renderCreative} from '../server/creative.mjs';
const post={type:'news',title:'Source-backed headline',created_at:'2026-11-12T00:00:00Z',seo:{category:'general'},creative:{ratio:'4:5'}};
const page={name:'News brand',kind:'news',language:'English',brand:{logoMode:'adaptive',logoLightWidth:200}};
const mark=async color=>sharp(Buffer.from(`<svg width="160" height="60"><rect x="10" y="10" width="140" height="40" fill="${color}"/><rect x="40" y="20" width="20" height="20" fill-opacity="0"/></svg>`)).png().toBuffer();
async function headerPixels(bytes){return sharp(bytes).extract({left:60,top:20,width:240,height:130}).removeAlpha().raw().toBuffer({resolveWithObject:true});}
function bounds({data,info},predicate){let left=info.width,right=-1,count=0;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*3;if(predicate(data[i],data[i+1],data[i+2])){left=Math.min(left,x);right=Math.max(right,x);count++;}}return {width:right-left+1,count};}
test('a dark transparent original logo is visible on the news canvas in adaptive mode',async()=>{
 const result=await renderCreative({post,page,brandLogo:await mark('#000000')});
 assert.equal(result.brandLogoUsed,true);const visible=bounds(await headerPixels(result.bytes),(r,g,b)=>r>190&&g>190&&b>190);
 assert(visible.count>1000,'the actual supplied mark must contribute visible pixels, not only a metadata flag');
});
test('news logo width controls the rendered mark while staying in its header area',async()=>{
 const logo=await mark('#000000'),small=await renderCreative({post,page:{...page,brand:{...page.brand,logoLightWidth:80}},brandLogo:logo}),large=await renderCreative({post,page,brandLogo:logo});
 const bright=(r,g,b)=>r>190&&g>190&&b>190,a=bounds(await headerPixels(small.bytes),bright),b=bounds(await headerPixels(large.bytes),bright);
 assert(b.width>a.width*1.8,'saving a larger width must actually enlarge the news logo');assert(b.width<=202,'the selected logo width bounds the visible artwork');
});
test('an explicitly supplied light-canvas variant retains its colors despite adaptive original mode',async()=>{
 const result=await renderCreative({post,page:{...page,brand:{...page.brand,logoLightAssetId:'explicit-light-variant'}},brandLogo:await mark('#dd4433')});
 const colored=bounds(await headerPixels(result.bytes),(r,g,b)=>r>140&&r>g+60&&r>b+60);assert(colored.count>1000,'explicit variant colors must not be changed into monochrome');
});
