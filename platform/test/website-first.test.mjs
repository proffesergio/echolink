import test from 'node:test';
import assert from 'node:assert/strict';
import {websiteBeforeDesign} from '../server/website-first.mjs';
const task={workspace_id:'w',post_id:'post',page_id:'page'},page={id:'page',creative_policy:{}},site={connector:'nobleseek_db'},connection={secret:{}};
function dependencies(){let status,writeCount=0;const events=[],post={id:'post',seo:{article:{text:'A complete verified report.'}}};return {post,events,get writes(){return writeCount;},options:{transact:async(_w,fn)=>fn({query:async sql=>{if(sql.startsWith('SELECT status'))return {rows:status?[{status}]:[]};if(sql.startsWith('INSERT INTO creator.publication_deliveries'))status='running';events.push(sql.startsWith('UPDATE creator.posts')?'url-saved':'db');return {rows:[]};}}),receipt:async(_t,_d,value)=>{status=value;events.push(value);},updateTask:async(_t,_p,phase)=>events.push(phase),write:async(_c,_s,_site,_post,{onWrite})=>{onWrite();writeCount++;return {link:'https://news.example/report',slug:'report'};},verify:async()=>{events.push('live-verified');return {url:'https://news.example/report'};}}};}
test('full website report is saved and publicly verified before allowing design, and an existing URL does not create another article',async()=>{
 const d=dependencies();await websiteBeforeDesign({task,page,post:d.post,site,connection},d.options);assert.equal(d.writes,1);assert(d.events.indexOf('url-saved')<d.events.indexOf('live-verified'));assert.equal(d.post.website_url,'https://news.example/report');await websiteBeforeDesign({task,page,post:d.post,site,connection},d.options);assert.equal(d.writes,1);
});
test('lost website write responses are held instead of blindly submitting another article',async()=>{
 const d=dependencies();d.options.write=async(_c,_s,_site,_post,{onWrite})=>{onWrite();throw new Error('lost response');};await assert.rejects(()=>websiteBeforeDesign({task,page,post:d.post,site,connection},d.options),e=>e.code==='publication_unknown');assert(d.events.includes('unknown'));
});
test('a saved website URL survives a public verification delay and the next check does not rewrite it',async()=>{
 const d=dependencies();d.options.verify=async()=>{throw new Error('not live yet');};await assert.rejects(()=>websiteBeforeDesign({task,page,post:d.post,site,connection},d.options),e=>e.status===503);assert.equal(d.writes,1);d.options.verify=async()=>({});await websiteBeforeDesign({task,page,post:d.post,site,connection},d.options);assert.equal(d.writes,1);
});
