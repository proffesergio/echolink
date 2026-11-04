import '../src/env.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {query,closePools} from '../src/db.mjs';
import {hash} from '../src/core.mjs';
import {findSemanticDuplicate,semanticConfiguration,SemanticError} from '../src/semantic.mjs';
import {processQueue} from '../src/jobs.mjs';
if(!process.env.ECHOLINK_TEST_BRANCH)throw new Error('A disposable branch is required');
Object.assign(process.env,{SEMANTIC_ENABLED:'true',SEMANTIC_THRESHOLD:'0.95',SEMANTIC_TTL_DAYS:'7',EMBEDDING_URL:'http://127.0.0.1:11434/v1/embeddings',EMBEDDING_MODEL:'embeddinggemma-test',ALLOWED_AI_HOSTS:'127.0.0.1',NOBLESEEK_ENABLED:'false',DRY_RUN:'false'});
const page={id:'recSemanticProbe',active:true,fbPageId:'123',fbSecret:'unused',timezone:'Asia/Dhaka',start:'00:00',end:'00:00',dailyMax:100,minimumGap:1,approval:true};
const fetchOriginal=globalThis.fetch;let embeds=0,broken=false;
globalThis.fetch=async(url,options)=>{
  const u=new URL(url);assert.equal(u.hostname,'127.0.0.1','No external request or Facebook publishing is allowed');assert.equal(u.pathname,'/v1/embeddings');
  if(broken)return Response.json({error:'Unavailable'},{status:503});
  const input=JSON.parse(options.body).input;embeds+=input.length;
  return Response.json({data:input.map((text,index)=>({index,embedding:text.includes('unrelated')?[0,1]:[1,0]}))});
};
async function make({pageId=page.id,status='Approved',title='Repeated event',old=false,published=true}={}){
  const id=randomUUID(),caption='A reviewed caption for semantic delivery verification.';
  await query(`INSERT INTO echolink.articles(id,page_id,url_hash,title_hash,title,source_url,body,caption,caption_hash,approval_hash,status,source_published_at,created_at,published_at)
    VALUES($1::uuid,$2,$1::text,$1::text,$3,'https://example.com/semantic','Source body',$4,$5,$5,$6,now(),now()-($7::int*interval '1 day'),CASE WHEN $8::boolean THEN now()-interval '3 hours' ELSE NULL END)`,[id,pageId,title,caption,hash(caption),status,old?40:0,published]);
  return (await query('SELECT * FROM echolink.articles WHERE id=$1',[id])).rows[0];
}
try{
  await query("INSERT INTO echolink.configurations(kind,id,config) VALUES('page',$1,$2)",[page.id,JSON.stringify(page)]);
  const posted=await make({status:'Posted',old:true}),prepared=await make({published:false});
  const result=(await processQueue({pageId:page.id,articleId:prepared.id})).pages[0];
  assert.equal(result.duplicate,prepared.id);assert.equal(result.matchedArticle,posted.id);assert.equal(embeds,2);
  const skipped=(await query('SELECT status,last_error FROM echolink.articles WHERE id=$1',[prepared.id])).rows[0];assert.equal(skipped.status,'Skipped (Duplicate)');assert.match(skipped.last_error,/cosine 1.0000/);
  assert.equal((await query('SELECT count(*)::int AS n FROM echolink.publish_attempts WHERE article_id=$1',[prepared.id])).rows[0].n,0);
  const next=await make({published:false});assert.equal((await findSemanticDuplicate(page,next)).id,posted.id);assert.equal(embeds,3,'The missing historical vector is backfilled only once');
  await findSemanticDuplicate(page,next);assert.equal(embeds,3,'Current and historical vectors are reused');
  process.env.EMBEDDING_MODEL='embeddinggemma-new-version';await findSemanticDuplicate(page,next);assert.equal(embeds,5,'Changing the model invalidates both cached vectors');
  assert.ok((await query('SELECT vector_model FROM echolink.articles WHERE id=$1',[posted.id])).rows[0].vector_model.startsWith(semanticConfiguration().profile+':'));
  await query("UPDATE echolink.articles SET body='Updated source lead' WHERE id=$1",[posted.id]);await findSemanticDuplicate(page,next);assert.equal(embeds,6,'Changing source text invalidates the historical vector');
  const unrelated=await make({title:'unrelated event',published:false});assert.equal(await findSemanticDuplicate(page,unrelated),null);
  const other=await make({pageId:'recOtherSemanticProbe',published:false});assert.equal(await findSemanticDuplicate({id:other.page_id},other),null,'Another Page never inherits the published-story match');
  await query("UPDATE echolink.articles SET published_at=now()-interval '8 days' WHERE id=$1",[posted.id]);assert.equal(await findSemanticDuplicate(page,next),null,'Memory expires by publication time');
  const unpublished=await make({status:'Pending Approval',published:false});assert.equal(await findSemanticDuplicate(page,next),null,'Unpublished stories never suppress each other');
  await query("UPDATE echolink.articles SET status='Publish Unknown',published_at=NULL WHERE id=$1",[unpublished.id]);assert.equal((await findSemanticDuplicate(page,next)).id,unpublished.id,'An unresolved publication reserves the story');
  const failure=await make({published:false});broken=true;await assert.rejects(findSemanticDuplicate(page,failure),SemanticError);
  const failed=(await processQueue({pageId:page.id,articleId:failure.id})).pages[0];
  // An unresolved earlier publication blocks the Page before any generation.
  assert.match(failed.queued,/unresolved/);
  await query("UPDATE echolink.articles SET status='Draft' WHERE id=$1",[unpublished.id]);
  const errored=(await processQueue({pageId:page.id,articleId:failure.id})).pages[0];assert.equal(errored.failed,failure.id);assert.match(errored.error,/Semantic duplicate check failed/);
  assert.equal((await query('SELECT count(*)::int AS n FROM echolink.publish_attempts WHERE article_id=$1',[failure.id])).rows[0].n,0);
  console.log('PASS semantic delivery on disposable DB: prepared approved caption cannot bypass dedup; previously ingested/recently posted story is indexed; caches and model changes; Page isolation; publication-time TTL; unpublished drafts do not suppress; unknown publication reserves; provider failure sends no post. Only mocked local embeddings used.');
  if(process.env.ECHOLINK_TEST_REAL_EMBEDDINGS==='true'){
    Object.assign(process.env,{EMBEDDING_URL:'http://127.0.0.1:11434/v1/embeddings',EMBEDDING_MODEL:'embeddinggemma:latest'});
    globalThis.fetch=(url,options)=>{
      const u=new URL(url);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'11434');assert.equal(u.pathname,'/v1/embeddings','Only the real local embedding service is allowed');
      return fetchOriginal(url,options);
    };
    const realPage={...page,id:'recRealSemanticProbe'};await query("INSERT INTO echolink.configurations(kind,id,config) VALUES('page',$1,$2)",[realPage.id,JSON.stringify(realPage)]);
    const history=await make({pageId:realPage.id,status:'Posted',old:true}),candidate=await make({pageId:realPage.id,published:false});
    await query("UPDATE echolink.articles SET title='সিলেটে ভারী বৃষ্টির পূর্বাভাস',body='আগামী দুই দিন সিলেট অঞ্চলে ভারী বৃষ্টি হতে পারে বলে আবহাওয়া অধিদপ্তর জানিয়েছে। পাহাড়ি এলাকায় ভূমিধসের সম্ভাবনার কথাও উল্লেখ করেছে সংস্থাটি।' WHERE id=ANY($1::uuid[])",[[history.id,candidate.id]]);
    const realResult=(await processQueue({pageId:realPage.id,articleId:candidate.id})).pages[0];assert.equal(realResult.duplicate,candidate.id);assert.equal(realResult.matchedArticle,history.id);assert.ok(realResult.similarity>0.99);
    const indexed=(await query('SELECT vector,vector_model FROM echolink.articles WHERE id=ANY($1::uuid[])',[[history.id,candidate.id]])).rows;assert.ok(indexed.every(row=>row.vector.length===768));
    assert.equal((await query('SELECT count(*)::int AS n FROM echolink.publish_attempts WHERE article_id=$1',[candidate.id])).rows[0].n,0);
    console.log('PASS real local embedding integration: installed embeddinggemma → 768-dimensional vectors → cloned Postgres history/cache → prepared-caption semantic skip. No Facebook request or production writes. This identical-lead smoke test is not a general accuracy benchmark.');
  }
}finally{globalThis.fetch=fetchOriginal;await closePools()}
