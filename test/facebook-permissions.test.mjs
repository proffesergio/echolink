import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {checkFacebookConnection,facebookFailure} from '../src/facebook.mjs';
test('Facebook identity access cannot pass as publishing permission; scope diagnostics expose no token',async()=>{
  const old={FB_TOKENS_JSON:process.env.FB_TOKENS_JSON,META_GRAPH_VERSION:process.env.META_GRAPH_VERSION};
  try{
    for(const scopes of [['pages_show_list','pages_manage_ads','pages_read_engagement'],['pages_read_engagement','pages_manage_posts'],['pages_read_engagement','pages_manage_posts','pages_manage_engagement']]){
      const token=randomUUID();process.env.FB_TOKENS_JSON=JSON.stringify({probe:token});process.env.META_GRAPH_VERSION='v26.0';
      const result=await checkFacebookConnection({fbSecret:'probe',fbPageId:'123'},async url=>Response.json(String(url).includes('/debug_token')?{data:{is_valid:true,type:'PAGE',scopes}}:{id:'123',name:'Test Page'}));
      assert.equal(result.publishReady,scopes.includes('pages_manage_posts'));assert.equal(result.commentsReady,scopes.includes('pages_manage_engagement'));
      if(!result.publishReady)assert.match(result.reason,/pages_manage_posts/);assert.ok(!JSON.stringify(result).includes(token));
    }
    const diagnostic=facebookFailure({code:200,message:'Arbitrary private text secret-token-here pages_manage_posts unavailable'});
    assert.match(diagnostic,/pages_manage_posts/);assert.ok(!diagnostic.includes('secret-token-here'));
  }finally{for(const [key,value]of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
