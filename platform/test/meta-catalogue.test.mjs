import test from 'node:test';
import assert from 'node:assert/strict';
import {metaCatalogueCSV,catalogueFeedURL,newCataloguePolicy,validCatalogueKey} from '../server/meta-catalogue.mjs';
test('Meta export uses original photos, BDT, stable IDs, stock and CSV escaping',()=>{
 const product={id:'internal',external_id:'sku-12',title:'Fan, "portable"',description:'<p>Battery fan</p>',url:'https://shop.example/products/fan',image_url:'https://shop.example/fan.jpg',price:'1250',currency:'BDT',available:false,attributes:{brand:'Example',category:'Fans'}};
 const out=metaCatalogueCSV([product,{...product,external_id:'bad',image_url:'http://localhost/private'}]);
 assert.equal(out.included,1);assert.equal(out.excluded,1);assert.match(out.csv,/1250.00 BDT/);assert.match(out.csv,/Fan, ""portable""/);assert.match(out.csv,/out of stock/);assert.match(out.csv,/sku-12/);assert.doesNotMatch(out.csv,/<p>|localhost/);
});
test('Feed signatures are Page scoped, revocable and cannot bypass workspace boundaries',()=>{
 const oldKey=process.env.PLATFORM_ENCRYPTION_KEY,oldOrigin=process.env.PLATFORM_ORIGIN;
 process.env.PLATFORM_ENCRYPTION_KEY='a'.repeat(64);process.env.PLATFORM_ORIGIN='https://dashboard.example';
 try{const workspace='11111111-1111-4111-8111-111111111111',page='22222222-2222-4222-8222-222222222222',policy=newCataloguePolicy(true),url=new URL(catalogueFeedURL(workspace,page,policy)),key=url.searchParams.get('key');
 assert(validCatalogueKey(workspace,page,policy,key));assert(!validCatalogueKey(page,workspace,policy,key));assert(!validCatalogueKey(workspace,page,newCataloguePolicy(true),key));assert(!validCatalogueKey(workspace,page,{...policy,enabled:false},key));assert.equal(catalogueFeedURL(workspace,page,{enabled:false}),null);
 }finally{if(oldKey===undefined)delete process.env.PLATFORM_ENCRYPTION_KEY;else process.env.PLATFORM_ENCRYPTION_KEY=oldKey;if(oldOrigin===undefined)delete process.env.PLATFORM_ORIGIN;else process.env.PLATFORM_ORIGIN=oldOrigin;}
});
