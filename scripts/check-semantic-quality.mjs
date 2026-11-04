import '../src/env.mjs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {embedArticles,semanticConfiguration} from '../src/semantic.mjs';
import {cosine} from '../src/core.mjs';

const env={...process.env,EMBEDDING_MODEL:process.env.SEMANTIC_TEST_MODEL||'embeddinggemma:latest'};
const fixture=JSON.parse(await readFile(new URL('../test/fixtures/semantic-bn-v1.json',import.meta.url),'utf8'));
const started=Date.now(),vectors=new Map(),c=semanticConfiguration(env);
for(let offset=0;offset<fixture.articles.length;offset+=4){
  const batch=fixture.articles.slice(offset,offset+4),embedded=await embedArticles(batch,{env});
  batch.forEach((article,index)=>vectors.set(article.id,embedded[index]));
  console.log(`Embedded ${Math.min(offset+4,fixture.articles.length)}/${fixture.articles.length} calibration articles`);
}
const scores=fixture.pairs.map(pair=>({...pair,score:cosine(vectors.get(pair.left),vectors.get(pair.right))}));
const thresholds=[0.8,0.85,0.9,0.92,0.95,0.97,0.99].map(threshold=>{
  const tp=scores.filter(p=>p.duplicate&&p.score>=threshold).length,fp=scores.filter(p=>!p.duplicate&&p.score>=threshold).length;
  const fn=scores.filter(p=>p.duplicate&&p.score<threshold).length,tn=scores.filter(p=>!p.duplicate&&p.score<threshold).length;
  return {threshold,tp,fp,fn,tn,precision:tp+fp?tp/(tp+fp):null,recall:tp/(tp+fn)};
});
const report={at:new Date().toISOString(),acceptedForAutomaticSkipping:false,model:c.model,profile:c.profile,dimensions:vectors.values().next().value.length,elapsedSeconds:Math.round((Date.now()-started)/1000),description:fixture.description,scores,thresholds};
await mkdir('.codex/logs',{recursive:true});await writeFile('.codex/logs/semantic-quality.json',JSON.stringify(report,null,2)+'\n');
console.table(thresholds);console.table(scores.map(p=>({left:p.left,right:p.right,duplicate:p.duplicate,score:Number(p.score.toFixed(4))})));
console.log('Calibration completed without database writes, setting changes or publication. Results: .codex/logs/semantic-quality.json');
