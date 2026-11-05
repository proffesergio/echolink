import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {scheduleHealth,minuteSchedule} from './workflow-schedule.mjs';

export const pipelineId='echolinkPipeline01';
const legacyIds=[...Array.from({length:7},(_,i)=>`echolinkLocal${String(i+1).padStart(3,'0')}`),'echolinkComments1'];
export function workflowStatus(){
  let db;
  try{
    const path=process.env.N8N_SQLITE_PATH||join(process.env.USERPROFILE||process.env.HOME,'.n8n','database.sqlite');
    db=new DatabaseSync(path,{readOnly:true});
    const known=new Set([pipelineId,...legacyIds]),rows=db.prepare('SELECT id,name,active,nodes,versionId,activeVersionId FROM workflow_entity').all().filter(row=>known.has(row.id)).map(({nodes,...row})=>({...row,...(row.id===pipelineId?{schedule:scheduleHealth({nodes:JSON.parse(nodes)})}:{})}));
    const pipeline=rows.find(r=>r.id===pipelineId)||null;
    if(pipeline){
      try{pipeline.lastTickAt=db.prepare("SELECT startedAt FROM execution_entity WHERE workflowId=? AND mode='trigger' ORDER BY startedAt DESC LIMIT 1").get(pipelineId)?.startedAt||null;}catch{pipeline.lastTickAt=null;}
      pipeline.unpublishedChanges=!!pipeline.active&&pipeline.versionId!==pipeline.activeVersionId;
      pipeline.tickStale=!!pipeline.active&&!!pipeline.lastTickAt&&Date.now()-new Date(/[zZ]|[+-]\d\d:\d\d$/.test(pipeline.lastTickAt)?pipeline.lastTickAt:pipeline.lastTickAt+'Z').getTime()>5*60000;
    }
    return {available:true,controlConfigured:!!process.env.N8N_API_KEY,pipeline,legacy:rows.filter(r=>r.id!==pipelineId),url:`${process.env.N8N_BASE_URL||'http://localhost:5678'}/workflow/${pipelineId}`};
  }catch{return {available:false,error:'Local n8n workflow database is unavailable. Check N8N_SQLITE_PATH and n8n installation.'};}
  finally{db?.close();}
}
async function cli(command,id){
  const base=new URL(process.env.N8N_BASE_URL||'http://localhost:5678');
  if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname))throw new Error('Use a localhost n8n API endpoint');
  if(!process.env.N8N_API_KEY)throw new Error('Save an n8n API key in Settings or publish the workflow directly in n8n');
  const active=command==='publish:workflow',headers={'X-N8N-API-KEY':process.env.N8N_API_KEY,Connection:'close'};
  const send=()=>fetch(new URL('/api/v1/workflows/'+id+'/'+(active?'activate':'deactivate'),base),{method:'POST',headers,signal:AbortSignal.timeout(10000)});
  let response;
  try{response=await send();}catch{
    // Activation can succeed before a local socket closes. Read state before
    // retrying this idempotent control operation; never apply this to publishing.
    const checked=await fetch(new URL('/api/v1/workflows/'+id,base),{headers,signal:AbortSignal.timeout(5000)});
    if(checked.ok&&(await checked.json()).active===active)return;
    response=await send();
  }
  if(!response.ok)throw new Error('n8n API rejected the change (HTTP '+response.status+'). Check the saved API key and workflow permissions.');
}
let pending=Promise.resolve();
export function controlWorkflow(action){
  const run=pending.then(async()=>{
    if(!['start','stop','repair'].includes(action))throw new Error('Unknown workflow control');
    const status=workflowStatus();if(!status.available||!status.pipeline)throw new Error('Import Complete pipeline before starting it');
    if(action==='repair'){
      const base=new URL(process.env.N8N_BASE_URL||'http://localhost:5678');
      if(!['localhost','127.0.0.1','[::1]'].includes(base.hostname)||base.username||base.password)throw new Error('Use a localhost n8n API endpoint');
      if(!process.env.N8N_API_KEY)throw new Error('Save an n8n API key in Settings before repairing the schedule');
      const headers={'X-N8N-API-KEY':process.env.N8N_API_KEY,'Content-Type':'application/json',Connection:'close'};
      const response=await fetch(new URL('/api/v1/workflows/'+pipelineId,base),{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('n8n API rejected schedule inspection (HTTP '+response.status+').');
      const workflow=await response.json();
      if(!scheduleHealth(workflow).ready){
        const fixed=minuteSchedule(workflow);
        await mkdir('.codex/backups',{recursive:true});
        await writeFile('.codex/backups/n8n-before-schedule-repair-'+Date.now()+'.json',JSON.stringify(workflow),{mode:0o600});
        if(workflow.active)await cli('unpublish:workflow',pipelineId);
        try{
          const updated=await fetch(new URL('/api/v1/workflows/'+pipelineId,base),{method:'PUT',headers,redirect:'error',signal:AbortSignal.timeout(15000),body:JSON.stringify({name:fixed.name,nodes:fixed.nodes,connections:fixed.connections,settings:fixed.settings})});
          if(!updated.ok)throw new Error('n8n API rejected schedule repair (HTTP '+updated.status+').');
        }finally{if(workflow.active)await cli('publish:workflow',pipelineId);}
      }
    }else if(action==='start'){
      for(const row of status.legacy.filter(r=>r.active))await cli('unpublish:workflow',row.id);
      if(!status.pipeline.active)await cli('publish:workflow',pipelineId);
    }else{
      for(const row of [status.pipeline,...status.legacy].filter(r=>r.active))await cli('unpublish:workflow',row.id);
    }
    return workflowStatus();
  });
  pending=run.catch(()=>{});return run;
}
