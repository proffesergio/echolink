import {test} from 'node:test';
import assert from 'node:assert/strict';
import {semanticInput,semanticConfiguration,embedArticles,findSemanticDuplicate} from '../src/semantic.mjs';
const env={EMBEDDING_URL:'http://localhost:11434/v1/embeddings',EMBEDDING_MODEL:'embeddinggemma:latest',ALLOWED_AI_HOSTS:'localhost',SEMANTIC_ENABLED:'true'};

test('semantic inputs use one versioned model profile and bounded consistent Bangla leads',()=>{
  const article={title:'  বাংলা   শিরোনাম ',body:' প্রথম  অনুচ্ছেদ '.repeat(500)},text=semanticInput(article,env.EMBEDDING_MODEL);
  assert.match(text,/^task: sentence similarity \| query: বাংলা শিরোনাম/);
  assert.equal(text,semanticInput({...article,body:article.body.slice(0,900)},env.EMBEDDING_MODEL));
  const profile=semanticConfiguration(env).profile;assert.notEqual(profile,semanticConfiguration({...env,EMBEDDING_MODEL:'other'}).profile);
  assert.notEqual(profile,semanticConfiguration({...env,EMBEDDING_URL:'http://localhost:1234/v1/embeddings'}).profile);
  assert.throws(()=>semanticConfiguration({...env,SEMANTIC_TTL_DAYS:'Infinity'}));
  assert.throws(()=>semanticConfiguration({...env,SEMANTIC_THRESHOLD:'NaN'}));
});

test('embedding batches preserve response indices and reject invalid or mixed vectors',async()=>{
  const articles=[{title:'one'},{title:'two'}];let seen;
  const vectors=await embedArticles(articles,{env,fetcher:async(url,options,policy)=>{seen={url,options,policy};return {data:[{index:1,embedding:[0,1]},{index:0,embedding:[1,0]}]};}});
  assert.deepEqual(vectors,[[1,0],[0,1]]);assert.equal(JSON.parse(seen.options.body).model,env.EMBEDDING_MODEL);assert.deepEqual(seen.policy.hosts,['localhost']);
  for(const data of [[],[{index:0,embedding:[1,0]},{index:0,embedding:[0,1]}],[{embedding:[1,0]},{embedding:[0,1]}],[{index:0,embedding:[0,0]},{index:1,embedding:[1,0]}],[{index:0,embedding:[1,0]},{index:1,embedding:[1]}],[{index:0,embedding:[NaN,0]},{index:1,embedding:[1,0]}]])
    await assert.rejects(embedArticles(articles,{env,fetcher:async()=>({data})}));
});

test('disabled semantic mode does not access the database or model',async()=>{
  assert.equal(await findSemanticDuplicate({id:'page'},{id:'article'},{env:{SEMANTIC_ENABLED:'false'},db:()=>assert.fail('Unexpected DB access'),fetcher:()=>assert.fail('Unexpected model access')}),null);
});
