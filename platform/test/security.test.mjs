import test from 'node:test';
import assert from 'node:assert/strict';
import '../server/env.mjs';
import {randomUUID} from 'node:crypto';
import {encryptSecret,decryptSecret} from '../server/vault.mjs';
import {privateAddress,publicURL,outbound} from '../server/net.mjs';
import {inWindow,pageClock} from '../server/scheduling.mjs';
import {providerConfig,providers} from '../server/providers.mjs';
import {parseProductHTML,normalizeProduct,canonicalArticleURL} from '../server/catalog.mjs';
import {validate} from '../server/validation.mjs';
import {editorialWarnings} from '../server/editorial.mjs';
test('secrets are randomized, authenticated and bound to one workspace',()=>{
 const w=randomUUID(),value={token:'test-only-secret'},a=encryptSecret(value,w),b=encryptSecret(value,w);assert.notEqual(a,b);assert.deepEqual(decryptSecret(a,w),value);assert.throws(()=>decryptSecret(a,randomUUID()));assert.throws(()=>decryptSecret(a.slice(0,-2)+'xx',w));assert(!a.includes(value.token));
});
test('untrusted destinations cannot address loopback, LAN, metadata or credential URLs',async()=>{
 for(const ip of ['127.0.0.1','10.2.2.2','172.31.1.1','192.168.1.2','169.254.169.254','::1','::ffff:7f00:1','fc00::1','fe80::1'])assert(privateAddress(ip),ip);
 assert(!privateAddress('1.1.1.1'));assert(!privateAddress('2606:4700:4700::1111'));
 for(const url of ['http://example.com','https://localhost','https://127.1','https://[::1]','https://user:pass@example.com','https://metadata.google.internal'])assert.throws(()=>publicURL(url));
 await assert.rejects(()=>outbound('https://127.0.0.1/private'));await assert.rejects(()=>outbound('http://localhost:11434',{localOrigin:'http://localhost:1234'}));
});
test('provider registry has differentiated tools and ignores tenant endpoint overrides',()=>{
 assert(providers.length>=10);assert(providers.find(p=>p.id==='ollama').capabilities.includes('text'));assert(!providers.find(p=>p.id==='anthropic').capabilities.includes('image'));
 assert.equal(providerConfig({provider:'openai',config:{url:'http://127.0.0.1'}}).base,'https://api.openai.com');
 assert.equal(providerConfig({provider:'ollama',config:{url:'http://169.254.169.254'}}).base,process.env.PLATFORM_OLLAMA_URL||'http://127.0.0.1:11434');
});
test('posting windows handle Dhaka, overnight and full-day preferences',()=>{
 const p={timezone:'Asia/Dhaka',window_start:'09:00',window_end:'23:00'};assert.equal(pageClock(p,new Date('2026-11-05T04:00:00Z')).time,'10:00');assert(inWindow(p,new Date('2026-11-05T04:00:00Z')));assert(!inWindow(p,new Date('2026-11-05T20:00:00Z')));
 assert(inWindow({...p,window_start:'22:00',window_end:'06:00'},new Date('2026-11-05T20:00:00Z')));assert(inWindow({...p,window_start:'00:00',window_end:'00:00'},new Date('2026-11-05T04:00:00Z')));
});
test('product JSON-LD preserves actual photo, price, currency and stock',()=>{
 const html='<script type="application/ld+json">'+JSON.stringify({'@graph':[{'@type':'Product',name:'Cotton shirt',image:'https://example.com/shirt.jpg',offers:{price:'49.50',priceCurrency:'USD',availability:'https://schema.org/OutOfStock'}}]})+'</script>';
 const products=parseProductHTML(html,{url:'https://example.com/shirt'});assert.equal(products.length,1);assert.equal(products[0].price,49.5);assert.equal(products[0].available,false);assert.equal(products[0].image_url,'https://example.com/shirt.jpg');assert.equal(products[0].currency,'USD');
 assert.throws(()=>normalizeProduct({title:'Bad',price:'NaN'},{url:'https://example.com'}));assert.throws(()=>normalizeProduct({title:'Bad',image_url:'http://localhost/image'},{url:'https://example.com'}));
});
test('validation strips client-supplied roles and tenant IDs',()=>{
 const p=validate('post',{page_id:randomUUID(),type:'original',title:'Test',workspace_id:randomUUID(),status:'published',approved_version:1});assert.equal(p.workspace_id,undefined);assert.equal(p.status,undefined);assert.equal(p.approved_version,undefined);
 assert.throws(()=>validate('page',{name:'Test',niche:'x',language:'English',kind:'ecommerce',window_start:'27:00'}));
});
test('URL deduplication removes tracking but preserves article query identifiers',()=>{
 assert.equal(canonicalArticleURL('https://example.com/article?id=7&utm_source=feed#top'),'https://example.com/article?id=7');
 assert.notEqual(canonicalArticleURL('https://example.com/article?id=7'),canonicalArticleURL('https://example.com/article?id=8'));
});
test('editorial checks preserve Bangla/English numbers and hold unsupported claims for review',()=>{
 assert.deepEqual(editorialWarnings('দাম ৪৯.৫০ USD, স্টকে আছে।',{title:'Cotton shirt',price:49.5,currency:'USD'}),[]);
 assert(editorialWarnings('Price USD 39.50, 20% off!',{price:49.5}).some(w=>w.includes('numbers')));
 assert(editorialWarnings('Hurry, selling fast!',{title:'Shirt'}).some(w=>w.includes('Urgency')));
 assert(editorialWarnings('Blue cotton shirt. #MensFashion',{title:'Blue cotton shirt'}).some(w=>w.includes('Audience')));
});
