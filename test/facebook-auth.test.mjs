import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exchangePageToken,tokenLifecycle,facebookConnectionMetadata,tokenFingerprint} from '../src/facebook-auth.mjs';
import {facebookFailure,checkFacebookConnection} from '../src/facebook.mjs';

const scopes=['pages_show_list','pages_read_engagement','pages_manage_posts','pages_manage_engagement'];
const args={appId:'123',appSecret:'private-app-secret',userToken:'private-user-token',pageId:'456',version:'v26.0'};
function mock(changes={}){
  const calls=[];
  const fetcher=async(url,options)=>{
    const u=new URL(url);calls.push(u.pathname);assert.equal(u.origin,'https://graph.facebook.com');assert.equal(options.redirect,'error');
    if(changes.error)return Response.json({error:{code:190,error_subcode:463,message:'private-user-token'}},{status:401});
    let value;
    if(u.pathname.endsWith('/debug_token')){
      const page=u.searchParams.get('input_token')==='private-page-token';
      value={data:{is_valid:true,type:page?'PAGE':'USER',app_id:'123',scopes,expires_at:page?0:Math.floor(Date.now()/1000)+5000000,...(page?changes.page:changes.user)}};
    }else if(u.pathname.endsWith('/oauth/access_token')){
      assert.equal(u.searchParams.get('grant_type'),'fb_exchange_token');value={access_token:'private-long-user-token'};
    }else if(u.pathname.endsWith('/me/accounts'))value={data:[{id:'456',access_token:'private-page-token',name:'Page'}],...changes.accounts};
    else value={id:changes.identity||'456',name:'Page'};
    return Response.json(value);
  };
  return {fetcher,calls};
}
test('long-lived exchange validates app, permissions, selected Page and lifecycle before returning a Page credential',async()=>{
  const {fetcher,calls}=mock();const result=await exchangePageToken(args,fetcher);
  assert.equal(result.token,'private-page-token');assert.equal(result.connection.publishReady,true);
  assert.equal(result.connection.noScheduledExpiry,true);assert.equal(result.connection.expiryKnown,true);assert.equal(result.connection.expiresAt,null);
  assert.doesNotMatch(JSON.stringify(result.connection),/private-/);assert.equal(calls.length,5);
  const lifecycle=tokenLifecycle({expires_at:1900000000,data_access_expires_at:1900000001});
  assert.equal(lifecycle.noScheduledExpiry,false);assert.ok(lifecycle.dataAccessExpiresAt);assert.equal(tokenLifecycle().expiryKnown,false);
});
test('exchange refuses wrong app, User/Page token types, missing scopes, missing Page, wrong identity and expired tokens without leaking upstream prose',async()=>{
  for(const changes of [{user:{app_id:'other'}},{user:{type:'PAGE'}},{user:{scopes:['pages_show_list']}},{accounts:{data:[]}},{identity:'789'},
    {page:{type:'USER'}},{page:{app_id:'other'}},{page:{scopes:['pages_show_list']}},{page:{expires_at:1}},{error:true}]){
    const {fetcher}=mock(changes);await assert.rejects(exchangePageToken(args,fetcher),error=>{assert.doesNotMatch(error.diagnostic,/private-/);return true;});
  }
  assert.match(facebookFailure({code:190,subcode:463}),/expired.*190\/463/);
  assert.match(facebookFailure({code:190,subcode:460}),/security change/);
});
test('connection errors retain the actionable Meta subcode without exposing credentials',async()=>{
  const old={FB_TOKENS_JSON:process.env.FB_TOKENS_JSON,META_GRAPH_VERSION:process.env.META_GRAPH_VERSION};
  try{
    process.env.FB_TOKENS_JSON='{"test":"private-token"}';process.env.META_GRAPH_VERSION='v26.0';
    await assert.rejects(checkFacebookConnection({fbSecret:'test',fbPageId:'456'},async()=>Response.json({error:{code:190,error_subcode:463,message:'private-token'}},{status:401})),error=>{
      assert.equal(error.subcode,463);assert.match(error.diagnostic,/expired/);assert.doesNotMatch(error.diagnostic,/private-token/);return true;
    });
  }finally{for(const [key,value]of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
test('public lifecycle metadata is tied to the current token and never includes tokens or fingerprints',()=>{
  const keys=['FB_TOKENS_JSON','FB_CONNECTIONS_JSON'],old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try{
    process.env.FB_TOKENS_JSON=JSON.stringify({current:'private-current-token',stale:'private-rotated-token'});
    process.env.FB_CONNECTIONS_JSON=JSON.stringify({current:{id:'456',name:'Page',noScheduledExpiry:true,fingerprint:tokenFingerprint('private-current-token'),token:'private-current-token'},
      stale:{id:'789',fingerprint:tokenFingerprint('private-old-token')}});
    const metadata=facebookConnectionMetadata();assert.equal(metadata.length,1);assert.equal(metadata[0].alias,'current');
    assert.doesNotMatch(JSON.stringify(metadata),/private-|fingerprint/);
  }finally{for(const [key,value]of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
