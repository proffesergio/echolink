import test from 'node:test';
import assert from 'node:assert/strict';
import {insightRecords,summarizeInsights} from '../server/insights.mjs';
import {captionPrompt,backgroundPrompt} from '../server/prompts.mjs';
test('measured content guidance never fabricates reach or conversion counts',()=>{
 const records=insightRecords(Array.from({length:5},(_,i)=>({type:'photo',publishedAt:new Date(1760000000000+i*86400000).toISOString(),reactions:10,comments:2,shares:1})));
 const summary=summarizeInsights(records);assert.equal(summary.reach,0);assert.equal(summary.weightedEngagement,85);assert.equal(summary.sampleSize,5);assert.equal(summary.types[0].average,17);assert.match(summary.recommendation,/Try one photo/);assert.throws(()=>insightRecords([{publishedAt:'bad',reactions:-1}]));
});
test('product and editorial prompts separate facts, bilingual goals and backdrop-only art direction',()=>{
 const page={name:'Shop',niche:'Fashion',language:'Bilingual-Mix',brand:{color:'#112233'},creative_policy:{goal:'messages'}};
 const result=captionPrompt(page,{type:'product_sale'},{title:'Socks',description:'Cotton',price:240,currency:'BDT',available:true});assert.match(result.prompt,/Bangla and English/);assert.match(result.prompt,/inbox/);assert.match(result.system,/Never invent/);assert.equal(result.facts.price,undefined);assert.match(backgroundPrompt(page,{},{}),/No products, text/);
 const news=captionPrompt({...page,language:'Bangla'},{type:'news',title:'Facts',body:'Verified reporting'},null);assert.match(news.prompt,/Preserve attribution/);assert.match(news.prompt,/news summary/);
});
