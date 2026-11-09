import test from 'node:test';
import assert from 'node:assert/strict';
import {selectProductFocus} from '../server/product-focus.mjs';
const product={title:'Rechargeable desk fan',description:'3000mAh battery. 5W power. 3 speed levels.',attributes:{category:'Fans',battery:'3000mAh',power:'5W'}},connection={provider:'ollama',config:{automaticRouting:true,taskModels:{product_analysis:'phi3:3.8b'}}};
test('the small helper selects only a catalogue fact and cannot write a new marketing specification',async()=>{
 const options=[];const result=await selectProductFocus({product,connection,secret:{}},{complete:async(_c,_s,prompt,o)=>{options.push(o);assert(prompt.includes('3000mAh'));return '{"focus":1,"invented":"20 hour battery"}';}});
 assert.equal(result.selection,'model-ranked-catalogue-option');assert.equal(result.invented,undefined);assert.equal(options[0].purpose,'product_analysis');
 const fallback=await selectProductFocus({product,connection},{complete:async()=>'{"focus":999}'});assert.equal(fallback.selection,'catalogue-order');
 const timedOut=await selectProductFocus({product,connection},{complete:async()=>{throw new Error('CPU timeout');}});assert.equal(timedOut.selection,'catalogue-order');
});
