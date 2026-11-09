import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {analyzeProduct} from '../server/product-analysis.mjs';
import {commentLink} from '../server/link-comments.mjs';
import {metricReport,collectSocialReports} from '../server/social-reporting.mjs';
import {renderPageBrand,applyBrandFlow} from '../server/page-branding.mjs';
test('product analysis selects factual technical callouts and never Colour or Collection',()=>{
 const fan=analyzeProduct({title:'Rechargeable desk fan',description:'5000 mAh battery. Runtime: up to 8 hours. 2400 RPM. 90 degree oscillation. Charging time 3 hours.',attributes:{category:'Fans'}});assert.equal(fan.type,'fan');assert.equal(fan.style,'technical');assert.equal(fan.callouts[0].value,'5000 mAh');assert.match(fan.callouts[1].value,/8 hours/);assert.doesNotMatch(JSON.stringify(fan.callouts),/COLOUR|COLLECTION/);
 const sparse=analyzeProduct({title:'Desk fan',description:'Charging time 3 hours.',attributes:{color:'Black',category:'Fans'}});assert.deepEqual(sparse.callouts,[],'charging time is not battery runtime');
 assert.equal(analyzeProduct({title:'USB C charger',description:'65 W power',attributes:{}}).callouts[0].value,'65 W');
 assert.equal(analyzeProduct({title:'Cotton polo',description:'Regular fit, 175 GSM cotton',attributes:{category:'Shirts'}}).type,'apparel');
});
test('comment links select products and website stories without exposing third-party source links',()=>{
 assert.equal(commentLink({type:'product_sale',website_url:'https://example.com/article'},{url:'https://example.com/product'}),'https://example.com/product');
 assert.equal(commentLink({type:'news',website_url:'https://www.fabrything.com/nobleseek/story',source_url:'https://example.com/source'}),'https://nobleseek.fabrything.com/nobleseek/story');assert.equal(commentLink({type:'original'}),null);assert.equal(commentLink({type:'news',source_url:'https://example.com/source'}),null);assert.throws(()=>commentLink({type:'news',website_url:'http://127.0.0.1/secret'}));
});
test('reporting preserves genuine zero measurements and marks unavailable metrics without zero fabrication',async()=>{
 const zero=await metricReport(async()=>({data:[{total_value:{value:0}}]}),'https://example.com',{},'reach');assert.equal(zero.total,0);assert.equal(zero.status,'available');
 const empty=await metricReport(async()=>({data:[]}),'https://example.com',{},'reach');assert.equal(empty.total,null);assert.equal(empty.status,'unavailable');
 const unavailable=await metricReport(async()=>{throw {metaCode:200};},'https://example.com',{},'reach');assert.equal(unavailable.total,null);assert.match(unavailable.reason,/permission/);
 const reports=await collectSocialReports({page:{fb_page_id:'123'},connection:{config:{version:'v26.0'}},token:'fixture',request:async url=>url.includes('instagram_business_account')?{}:url.includes('posts?')?{data:[]}:url.includes('insights?')?{data:[]}:{id:'123',followers_count:0}});assert.equal(reports[0].account.followers_count,0);assert.equal(reports[1].status,'not_linked');
});
test('branding exports correct profile and cover dimensions and persists upload before applying',async()=>{
 for(const kind of ['profile','cover']){const image=await renderPageBrand({kind,page:{name:'Test Page',brand:{}},headline:'A useful headline',prompt:'light minimal'}),m=await sharp(image.bytes).metadata();assert.equal(m.width,kind==='profile'?1080:1640);assert.equal(m.height,kind==='profile'?1080:624);}
 const events=[];await applyBrandFlow({base:'https://graph.facebook.com/v26.0',pageId:'123',kind:'cover',upload:async()=>{events.push('upload');return '456';},onUploaded:async()=>events.push('persist'),onApplying:async()=>events.push('claim'),request:async(url,options)=>{assert.equal(options.body.cover,'456');events.push('apply');return {success:true};},headers:{}});assert.deepEqual(events,['upload','persist','claim','apply']);
});
