import test from 'node:test';
import assert from 'node:assert/strict';
import {categoryFor,balancedArticles,pickCatalogProduct,productDetails} from '../server/content-policy.mjs';
import {validate} from '../server/validation.mjs';
import {productCallouts} from '../server/product-design.mjs';
import {captionPrompt,prepareCaption,backgroundPrompt} from '../server/prompts.mjs';
test('catalog categories and factual fabric details survive normalization and rotation',()=>{
 const attributes=productDetails({brand:'Fabrilife',category_name:'T-shirts',material:'Combed cotton',color:'Black'});assert.equal(attributes.category,'T-shirts');assert.equal(attributes.brand,'Fabrilife');
 const a={id:'a',attributes:{category:'T-shirts'}},b={id:'b',attributes:{category:'Socks'}};assert.equal(pickCatalogProduct([a,b],['T-shirts'],()=>0).id,'b');assert.equal(pickCatalogProduct([],[],()=>0),null);
 assert.equal(productCallouts({title:'Shirt',attributes:{category:'T-shirts'}}).some(c=>c.label==='MATERIAL'),false);assert.equal(productCallouts({title:'Shirt',attributes}).find(c=>c.label==='MATERIAL').value,'Combed cotton');
});
test('news rotation prefers underrepresented sections and preserves actual source classification',()=>{
 assert.equal(categoryFor({category:'Sports',title:'Latest result'}),'sports');assert.equal(categoryFor({title:'এইচএসসি পরীক্ষার ফল প্রকাশ'}),'education');assert.equal(categoryFor({source_url:'https://www.prothomalo.com/sports/cricket/story',title:'পাঁচ দেশের বিপক্ষে পাঁচ উইকেট'}),'sports');
 const candidates=[{title:'রাজনীতি আজ',category:'Politics'},{title:'আজকের খেলা',category:'Sports'}];assert.equal(balancedArticles(candidates,['politics','politics'])[0].category,'sports');assert.equal(balancedArticles(candidates,[],['politics']).length,1);
});
test('post-type instructions stay independent and product prices never enter published copy',()=>{
 const page={name:'Shop',language:'Bilingual-Mix',creative_policy:{postTypePrompts:{product_sale:{caption:'Use a product story.',image:'Warm amber backdrop.'},news:{caption:'Keep attribution.'}}}},product={title:'Cotton T-shirt 2-pack',description:'Cotton fabric',price:123.70,currency:'BDT'};
 const prompt=captionPrompt(page,{type:'product_sale'},product);assert.equal(prompt.facts.price,undefined);assert.match(prompt.system,/product story/);assert.doesNotMatch(prompt.system,/Keep attribution/);assert.match(backgroundPrompt(page,{type:'product_sale'},product),/Warm amber/);
 const result=prepareCaption('Cotton T-shirt 2-pack.\nPrice: BDT 123.70\nএই পোশাকের বিস্তারিত জানতে ইনবক্সে যোগাযোগ করুন।\nMessage us for product details.',page,product);assert.doesNotMatch(result.caption,/123|BDT/);assert.match(result.caption,/2-pack/);assert.match(result.caption,/ইনবক্স/);
});

test('a Page may save instructions for one post type without filling every other type',()=>{
 const page=validate('page',{name:'Shop',niche:'Fashion',kind:'ecommerce',language:'Bilingual-Mix',creative_policy:{postTypePrompts:{product_sale:{caption:'Keep it factual.',image:'Warm lighting.'}}}});assert.equal(page.creative_policy.postTypePrompts.product_sale.caption,'Keep it factual.');assert.equal(page.creative_policy.postTypePrompts.news,undefined);
});
