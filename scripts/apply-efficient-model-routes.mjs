import '../platform/server/env.mjs';
import {transaction,audit,closeDatabase} from '../platform/server/db.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const apply=process.argv.includes('--apply');
try{console.log(JSON.stringify(await transaction(null,async db=>{
 const connections=(await db.query("SELECT DISTINCT c.id,c.workspace_id,c.config FROM creator.connections c JOIN creator.pages p ON p.text_connection_id=c.id AND p.workspace_id=c.workspace_id JOIN creator.workspaces w ON w.id=p.workspace_id JOIN creator.accounts a ON a.id=w.owner_id WHERE lower(a.email)=$1 AND c.provider='ollama'",[process.env.PLATFORM_OWNER_EMAIL.toLowerCase()])).rows;
 if(apply){await mkdir(new URL('../.codex/backups/',import.meta.url),{recursive:true});await writeFile(new URL('../.codex/backups/efficient-model-routes-'+Date.now()+'.json',import.meta.url),JSON.stringify(connections),{mode:0o600});}
 const gemma='gemma3:4b-it-q4_K_M',qwen='echotent:qwen3-4b',taskModels={research:gemma,product_analysis:gemma,news_article:gemma,news_review:qwen,news_caption:gemma,first_comment:gemma,design_brief:gemma,product_caption:gemma,instagram_caption:gemma,storyboard:qwen,reference_analysis:qwen};
 for(const c of connections)if(apply){const config={...c.config,model:gemma,simpleModel:gemma,complexModel:qwen,automaticRouting:true,automaticFallback:false,efficientContent:true,maxOutputTokens:4096,taskModels,taskContextTokens:{...c.config.taskContextTokens,news_article:6144,news_review:6144,design_brief:2048,product_caption:4096}};await db.query('UPDATE creator.connections SET config=$3 WHERE workspace_id=$1 AND id=$2',[c.workspace_id,c.id,config]);await audit(db,c.workspace_id,null,'inference.efficient-routes','connection',c.id,{taskModels,freeLocalOnly:true,measuredReportWords:146});}
 return {apply,connections:connections.length,taskModels,optionalFeatureRanking:'catalogue-order',deepseek:'Not routed: official endpoint is paid, no verified free API access'};
},{owner:true}),null,2));}finally{await closeDatabase();}
