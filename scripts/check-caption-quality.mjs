import '../src/env.mjs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {query,closePools} from '../src/db.mjs';
import {generate} from '../src/jobs.mjs';
import {editorialReviewReason} from '../src/editorial.mjs';
import {draftQuality} from '../src/newsroom.mjs';
import {hash,newsPromptVersion,candidateGenerationBody} from '../src/core.mjs';

const label=process.argv.find(a=>a.startsWith('--label='))?.slice(8)||'current';if(!/^[a-z0-9-]{1,40}$/i.test(label))throw new Error('Use a simple report label');
const selected=process.argv.find(a=>a.startsWith('--case='))?.slice(7);
const temperatureArgument=process.argv.find(a=>a.startsWith('--temperature='))?.slice(14);
const fixture=JSON.parse(await readFile(new URL('../test/fixtures/caption-facts-bn-v1.json',import.meta.url),'utf8'));
const requested=(selected||'').split(',').filter(Boolean);if(requested.some(id=>!fixture.cases.some(c=>c.id===id)))throw new Error('Unknown diagnostic case');
const cases=fixture.cases.filter(c=>!requested.length||requested.includes(c.id));
try{
  const rows=(await query("SELECT config FROM echolink.configurations WHERE kind='page' ORDER BY (config->>'active') DESC,id LIMIT 1")).rows;
  const page=rows[0]?.config;if(page?.infrastructure!=='Ollama'||page.language!=='Bangla')throw new Error('This diagnostic expects a configured local Ollama Bangla Page');
  if(temperatureArgument!==undefined){const value=Number(temperatureArgument);if(!Number.isFinite(value)||value<0||value>1)throw new Error('Diagnostic temperature must be 0–1');page.temperature=value;}
  const endpoint=new URL(page.endpoint);if(!['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname))throw new Error('Use a local model endpoint for this diagnostic');
  const report={at:new Date().toISOString(),acceptedForUnattendedPublishing:false,promptVersion:newsPromptVersion,model:page.model,temperature:page.temperature,fixtureHash:hash(JSON.stringify(fixture)),description:fixture.description,cases:[]};
  await mkdir('.codex/logs',{recursive:true});
  for(const source of cases){
    console.log(`Generating diagnostic ${source.id} with ${page.model}; no publishing or article writes.`);const started=Date.now();
    const attempts=[],retries=[],snapshot=async()=>writeFile(`.codex/logs/caption-attempts-${label}-${source.id}.json`,JSON.stringify({model:page.model,temperature:page.temperature,promptVersion:newsPromptVersion,attempts,retries},null,2)+'\n');
    try{
      const draft=await generate(page,{...source,publisher:'fictional-editorial-fixture',source_url:'https://example.com/fictional-test'},{bodyBuilder:candidateGenerationBody,checkAnalysisLanguage:true,onAttempt:async attempt=>{attempts.push(attempt);await snapshot();},onRetry:async(error,attempt)=>{const reason=/^(Caption |Analysis |Incomplete model JSON|Invalid AI caption|Empty model output|Upstream HTTP)/.test(error?.message||'')?error.message:'Generation validation failed';retries.push({attempt,reason});console.log(`Correcting ${source.id}: ${reason}`);await snapshot();}});
      const analysisText=draft.analysis.replace(/EDITORIAL[ _-]+REVIEW[ _-]+REQUIRED/gi,'');
      const letters=analysisText.match(/\p{L}/gu)||[],bangla=letters.filter(letter=>/\p{Script=Bengali}/u.test(letter));
      report.cases.push({id:source.id,promptHash:hash(JSON.stringify(candidateGenerationBody(page,{...source,publisher:'fictional-editorial-fixture'}))),source,expectation:source.expectation,draft,structureError:draftQuality(draft,page,source,{analysisLanguage:true}),reviewReason:editorialReviewReason({...source,...draft}),analysisBanglaRatio:bangla.length/Math.max(1,letters.length),elapsedSeconds:Math.round((Date.now()-started)/1000),editorialAssessment:'Requires reading caption and analysis against source; not certified by pattern checks.'});
      console.log(`Saved ${source.id}: ${draft.caption.length} caption characters; ${Math.round((Date.now()-started)/1000)} seconds.`);
    }catch(error){const detail=error.name==='HttpError'?`Provider HTTP ${error.status}`:error.name==='TimeoutError'?'Local model request timed out':/^(Caption is too short|Caption does not use|Analysis does not use|Caption copies|Incomplete model JSON|Invalid AI caption|Empty model output)/.test(error.message||'')?error.message:'Generation/quality validation failed';report.cases.push({id:source.id,failed:true,error:detail,elapsedSeconds:Math.round((Date.now()-started)/1000)});console.log(`Diagnostic ${source.id} failed: ${detail}.`);process.exitCode=1;}
    await writeFile(`.codex/logs/caption-quality-${label}.json`,JSON.stringify(report,null,2)+'\n');
  }
  console.log(`Diagnostic report: .codex/logs/caption-quality-${label}.json. No DB writes, approval changes, settings changes or publication.`);
}finally{await closePools()}
