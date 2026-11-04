import '../src/env.mjs';
import {query,closePools} from '../src/db.mjs';
import {embedArticles,semanticConfiguration} from '../src/semantic.mjs';
import {similarity} from '../src/newsroom.mjs';
import {cosine} from '../src/core.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
try{
  const articles=(await query("SELECT id,page_id,title,left(body,900) AS body,source_url,publisher FROM echolink.articles WHERE source_published_at>=now()-interval '2 days' ORDER BY source_published_at DESC LIMIT 500")).rows;
  const pairs=[];
  for(let i=0;i<articles.length;i++)for(let j=i+1;j<articles.length;j++){
    const a=articles[i],b=articles[j];if(a.page_id!==b.page_id||a.publisher===b.publisher)continue;
    const lexical=similarity(a.title,b.title);if(lexical>=0.4)pairs.push({left:a.id,right:b.id,lexical});
  }
  const selected=pairs.sort((a,b)=>b.lexical-a.lexical).slice(0,12),ids=new Set(selected.flatMap(pair=>[pair.left,pair.right])),subset=articles.filter(a=>ids.has(a.id));
  const env={...process.env,EMBEDDING_MODEL:process.env.SEMANTIC_TEST_MODEL||'embeddinggemma:latest'},vectors=new Map();
  for(let offset=0;offset<subset.length;offset+=4){const batch=subset.slice(offset,offset+4),result=await embedArticles(batch,{env});batch.forEach((a,i)=>vectors.set(a.id,result[i]));}
  const results=selected.map(pair=>({...pair,score:cosine(vectors.get(pair.left),vectors.get(pair.right))}));
  const report={at:new Date().toISOString(),profile:semanticConfiguration(env).profile,selection:'12 strongest cross-publisher lexical headline pairs among the latest 500 articles from two days; labels require reading source leads. No accuracy claim.',articles:subset,pairs:results};
  await mkdir('.codex/logs',{recursive:true});await writeFile('.codex/logs/semantic-corpus.json',JSON.stringify(report,null,2)+'\n');
  const byId=new Map(articles.map(a=>[a.id,a]));console.table(results.map(p=>({left:byId.get(p.left).title,right:byId.get(p.right).title,score:Number(p.score.toFixed(4))})));
  console.log(`Read-only corpus check: ${articles.length} articles scanned, ${results.length} pairs embedded. Leads saved locally for editorial labeling; no DB writes or publication.`);
}finally{await closePools()}
