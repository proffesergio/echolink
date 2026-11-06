import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveFacebookPage} from '../server/facebook.mjs';
const required=['pages_show_list','pages_manage_posts','pages_read_engagement'];
test('Page token must identify the selected Page, without listing other Pages',async()=>{
 const calls=[];const r=await resolveFacebookPage({token:'page-secret',pageId:'123',version:'v26.0'},async(url,options)=>{calls.push(url);assert.equal(options.headers.authorization,'Bearer page-secret');return {id:'123',name:'Shop',category:'Shopping'};});
 assert.equal(r.token,'page-secret');assert.equal(r.result.tokenSource,'page');assert.equal(calls.length,2);assert(!JSON.stringify(r.result).includes('page-secret'));
});
test('User token derives only the requested Page token across cursor pagination',async()=>{
 const r=await resolveFacebookPage({token:'user-secret',pageId:'123',version:'v26.0'},async(url,options)=>{
  assert(!url.includes('secret'));
  if(options.headers.authorization==='Bearer selected-page')return {id:'123',name:'Shop',category:'Shopping'};
  if(url.includes('/permissions'))return {data:required.map(permission=>({permission,status:'granted'}))};
  if(url.includes('/accounts'))return url.includes('after=next')?{data:[{id:'123',access_token:'selected-page',tasks:['CREATE_CONTENT']}]}:{data:[{id:'999',access_token:'wrong-page'}],paging:{next:'https://attacker.example/?access_token=secret',cursors:{after:'next'}}};
  return {id:'user-id',name:'User'};
 });assert.equal(r.token,'selected-page');assert.equal(r.result.id,'123');assert.equal(r.result.tokenSource,'user');
});
test('missing permissions, wrong Page and expired credentials fail before connection is saved',async()=>{
 await assert.rejects(resolveFacebookPage({token:'x',pageId:'123',version:'v26.0'},async url=>url.includes('permissions')?{data:[]}:{id:'user'}),/pages_manage_posts/);
 await assert.rejects(resolveFacebookPage({token:'x',pageId:'123',version:'v26.0',tokenType:'page'},async()=>({id:'999'})),/different Page/);
 await assert.rejects(resolveFacebookPage({token:'x',pageId:'123',version:'v26.0'},async()=>{throw new Error('Meta code 190/463');}),/190\/463/);
 await assert.rejects(resolveFacebookPage({token:'x',pageId:'123',version:'v26.0'},async url=>url.includes('permissions')?{data:required.map(permission=>({permission,status:'granted'}))}:url.includes('accounts')?{data:[{id:'999',access_token:'other'}]}:{id:'user'}),/cannot manage the selected Page/);
});
test('long-lived exchange validates the app and publishing scopes, then stores only the Page credential',async()=>{
 const r=await resolveFacebookPage({token:'short-user',pageId:'123',version:'v26.0',appId:'app',appSecret:'secret'},async(url,options)=>{
  if(url.includes('/debug_token'))return {data:url.includes('short-user')?{is_valid:true,type:'USER',app_id:'app'}:{is_valid:true,type:'PAGE',app_id:'app',scopes:required,expires_at:0}};
  if(url.includes('/oauth/access_token'))return {access_token:'long-user'};
  if(url.includes('/permissions'))return {data:required.map(permission=>({permission,status:'granted'}))};
  if(url.includes('/accounts')){assert.equal(options.headers.authorization,'Bearer long-user');return {data:[{id:'123',access_token:'durable-page',tasks:['CREATE_CONTENT']}]};}
  return options.headers.authorization==='Bearer durable-page'?{id:'123',name:'Shop',category:'Shopping'}:{id:'user'};
 });assert.equal(r.token,'durable-page');assert.equal(r.result.longLived,true);assert.equal(r.result.noScheduledExpiry,true);assert(!JSON.stringify(r.result).includes('long-user'));
});
