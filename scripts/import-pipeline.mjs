import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {readFile,writeFile,rm,mkdir} from 'node:fs/promises';
const db = new DatabaseSync(join(process.env.USERPROFILE,'.n8n','database.sqlite'),{readOnly:true});
const projects = db.prepare("SELECT id FROM project WHERE type='personal'").all(); db.close();
if(projects.length!==1)throw new Error('Select the n8n project before import');
await mkdir('.codex/secrets',{recursive:true});
const file='.codex/secrets/pipeline-import.json';
try{
  const workflows=await Promise.all(['00-complete-pipeline'].map(async n=>JSON.parse(await readFile(`workflows/${n}.json`,'utf8'))));
  await writeFile(file,JSON.stringify(workflows));
  const r=spawnSync('n8n',['import:workflow',`--input=${file}`,`--projectId=${projects[0].id}`],{shell:process.platform==='win32',encoding:'utf8',timeout:120000});
  if(r.status!==0)throw new Error('Pipeline import failed');
  console.log('Imported the single Complete pipeline (inactive). All existing workflows preserved.');
}finally{await rm(file,{force:true});}
