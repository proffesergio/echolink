import {generateFactualCaption} from '../server/caption-generation.mjs';
import '../server/env.mjs';
import {transaction,closeDatabase} from '../server/db.mjs';
import {textCompletion} from '../server/providers.mjs';
import {captionPrompt,prepareCaption} from '../server/prompts.mjs';
import {editorialWarnings} from '../server/editorial.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {freemem} from 'node:os';
const model=process.argv[2]||'echolink-qwen3:4b',results=[];
if((process.argv.includes('--news-only')||process.argv.includes('--products-only'))){const {readFile}=await import('node:fs/promises');const old=JSON.parse(await readFile(new URL('../.local/verification/qwen3/benchmark.json',import.meta.url),'utf8'));if(old.model!==model)throw new Error('Benchmark model differs.');results.push(...old.results.filter(r=>(process.argv.includes('--products-only')?r.page==='Noble Seek':r.page==='Fabrything')&&!r.error&&Object.values(r.checks).every(Boolean)));}
try{
 const samples=await transaction(null,async db=>{
  const pages=(await db.query('SELECT p.* FROM creator.pages p JOIN creator.workspaces w ON w.id=p.workspace_id JOIN creator.accounts a ON a.id=w.owner_id WHERE lower(a.email)=$1 AND p.kind IN (\'news\',\'ecommerce\') ORDER BY p.kind',[(process.env.PLATFORM_OWNER_EMAIL||'').toLowerCase()])).rows;
  const samples=[];for(const page of pages){
   const posts=(await db.query("SELECT * FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND body<>'' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1",[page.workspace_id,page.id])).rows;
   for(const post of posts){const product=post.product_id?(await db.query('SELECT * FROM creator.products WHERE workspace_id=$1 AND id=$2',[page.workspace_id,post.product_id])).rows[0]:null;samples.push({page,post,product});}
  }return samples;
 },{owner:true});
 for(const sample of samples.filter(s=>(!process.argv.includes('--news-only')||s.page.kind==='news')&&(!process.argv.includes('--products-only')||s.page.kind==='ecommerce')))for(const channel of ['facebook','instagram']){
  const {page,post,product}=sample,{facts,system,prompt}=captionPrompt(page,post,product,null,channel,{compact:true}),metrics=[];let minFree=freemem();const timer=setInterval(()=>minFree=Math.min(minFree,freemem()),1000),start=Date.now();
  console.log(`Testing ${page.name} · ${channel} · ${results.length+1}/${samples.length*2}`);
  try{
   const prepared=await generateFactualCaption({page,post,product,compact:true,channel,connection:{provider:'ollama',config:{model,temperature:0.6,contextTokens:4096,maxOutputTokens:900}}},{onMetrics:m=>metrics.push(m),onCorrection:async()=>console.log('Applying one source-fact correction pass')}),raw=prepared.rawCaption,warnings=prepared.warnings;
   const checks={rawContent:raw.trim().length>=60,captionLength:prepared.caption.length>=60&&prepared.caption.length<=(channel==='instagram'?2200:10000),bangla:/[\u0980-\u09ff]/u.test(prepared.caption),noURL:!/https?:\/\//i.test(prepared.caption),noThinking:!/<think>/i.test(prepared.caption),noPrice:!product||!/(?:৳|\bBDT\b|\bTK\b|\$\s*\d)/i.test(prepared.caption),noUnsupportedNumbers:!warnings.some(w=>w.startsWith('Check numbers'))};
   results.push({page:page.name,postId:post.id,title:post.title,channel,caption:prepared.caption,rawCaption:raw,source:JSON.stringify(prepared.facts),checks,warnings,notes:prepared.notes,metrics,minFreeMB:Math.round(minFree/1024**2),elapsedSeconds:Math.round((Date.now()-start)/1000)});
   console.log(JSON.stringify({page:page.name,channel,checks,warnings,metrics,minFreeMB:results.at(-1).minFreeMB}));
  }catch(error){results.push({page:page.name,postId:post.id,channel,error:error.message});console.log('Benchmark case failed: '+error.message);}
  finally{clearInterval(timer);}
 }
 const folder=new URL('../.local/verification/qwen3/',import.meta.url);await mkdir(folder,{recursive:true});await writeFile(new URL('benchmark.json',folder),JSON.stringify({passed:results.length>=4&&results.every(r=>!r.error&&Object.values(r.checks).every(Boolean)),model,at:new Date().toISOString(),realPublicationSubmitted:false,results},null,2));
 const passed=results.length>=4&&results.every(r=>!r.error&&Object.values(r.checks).every(Boolean));console.log(JSON.stringify({model,cases:results.length,passed,artifact:'platform/.local/verification/qwen3/benchmark.json',realPublicationSubmitted:false}));if(!passed)process.exitCode=1;
}finally{await closeDatabase();}
