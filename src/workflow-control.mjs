import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';

export const pipelineId='echolinkPipeline01';
const legacyIds=[...Array.from({length:7},(_,i)=>`echolinkLocal${String(i+1).padStart(3,'0')}`),'echolinkComments1'];
export function workflowStatus(){
  let db;
  try{
    const path=process.env.N8N_SQLITE_PATH||join(process.env.USERPROFILE||process.env.HOME,'.n8n','database.sqlite');
    db=new DatabaseSync(path,{readOnly:true});
    const known=new Set([pipelineId,...legacyIds]),rows=db.prepare('SELECT id,name,active FROM workflow_entity').all().filter(row=>known.has(row.id));
    return {available:true,controlConfigured:!!process.env.N8N_API_KEY,pipeline:rows.find(r=>r.id===pipelineId)||null,legacy:rows.filter(r=>r.id!==pipelineId),url:`${process.env.N8N_BASE_URL||'http://localhost:5678'}/workflow/${pipelineId}`};
  }catch{return {available:false,error:'Local n8n workflow database is unavailable. Check N8N_SQLITE_PATH and n8n installation.'};}
  finally{db?.close();}
}
async function cli(command,id){
  const base=new URL(process.env.N8N_BASE_URL||'http://localhost:5678');
  if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname))throw new Error('Use a localhost n8n API endpoint');
  if(!process.env.N8N_API_KEY)throw new Error('Save an n8n API key in Settings or publish the workflow directly in n8n');
  const response=await fetch(new URL('/api/v1/workflows/'+id+'/'+(command==='publish:workflow'?'activate':'deactivate'),base),{method:'POST',headers:{'X-N8N-API-KEY':process.env.N8N_API_KEY},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('n8n API rejected the change (HTTP '+response.status+'). Check the saved API key and workflow permissions.');
}
let pending=Promise.resolve();
export function controlWorkflow(action){
  const run=pending.then(async()=>{
    if(!['start','stop'].includes(action))throw new Error('Unknown workflow control');
    const status=workflowStatus();if(!status.available||!status.pipeline)throw new Error('Import Complete pipeline before starting it');
    if(action==='start'){
      for(const row of status.legacy.filter(r=>r.active))await cli('unpublish:workflow',row.id);
      if(!status.pipeline.active)await cli('publish:workflow',pipelineId);
    }else{
      for(const row of [status.pipeline,...status.legacy].filter(r=>r.active))await cli('unpublish:workflow',row.id);
    }
    return workflowStatus();
  });
  pending=run.catch(()=>{});return run;
}
