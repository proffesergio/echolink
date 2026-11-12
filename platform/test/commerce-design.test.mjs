import test from 'node:test';
import assert from 'node:assert/strict';
import {commerceStyle,pointerMarkup,contrastRatio,safeInk,HEADLINE_PRESETS} from '../server/commerce-design.mjs';
import {commerceDesignSchema} from '../server/commerce-settings.mjs';
import {renderProductCreative} from '../server/product-design.mjs';
test('commerce variation is opt-in, deterministic, bounded and contrast-aware',()=>{
 assert.equal(commerceStyle({id:'a'}).background,'original');assert.equal(commerceStyle({id:'a'}).pointer.enabled,false);
 const policy={commerceDesign:{background:'mixed',seed:'brand-1',headline:'highlight',pointer:{enabled:true,size:99,color:'url(evil)',rotation:500}}};
 assert.deepEqual(commerceStyle({id:'a'},policy),commerceStyle({id:'a'},policy));
 assert.equal(commerceStyle({id:'a'},policy).pointer.size,1.6);assert.equal(commerceStyle({id:'a'},policy).pointer.rotation,60);
 assert.equal(commerceStyle({id:'a'},policy).pointer.color,'#172d33');assert.throws(()=>commerceDesignSchema.parse({pointer:{color:'<script>'}}));
 assert(contrastRatio('#ffffff',safeInk('#ffffff','#ffffff'))>=4.5);assert.doesNotMatch(pointerMarkup({color:'<script>'}),/script|url\(/);
});
test('every headline preset renders product facts without prices or overflowing type',async()=>{
 for(const preset of Object.keys(HEADLINE_PRESETS)){
  const image=await renderProductCreative({page:{name:'Fabrything',brand:{},creative_policy:{websiteLabel:'fabrything.com',commerceDesign:{background:'mixed',seed:'check',headline:preset,pointer:{enabled:true,target:'product'}}}},post:{id:'fixture',creative:{}},product:{title:'Everyday Cotton Polo',price:999},width:540,height:675});
  assert.equal(image.designVersion,'product-v8');assert.equal(image.commerceStyle.preset,preset);assert.doesNotMatch(image.visibleText.join(' '),/999|৳|BDT/);
  for(const b of image.textBounds)assert(b.left>=0&&b.top>=0&&b.left+b.width<=image.width&&b.top+b.height<=image.height);
 }
});
