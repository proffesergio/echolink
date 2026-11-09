import {assertModelUse} from './model-routing.mjs';
import {inferenceHost} from './inference-host.mjs';
import {freemem,totalmem} from 'node:os';
import {AppError} from './errors.mjs';
import {remoteJSON} from './net.mjs';
import {inferenceIdle,ollamaCloudModel} from './inference-idle.mjs';

const MiB=1024*1024;
export const inferenceProfiles={
 windows_safe:{contextTokens:4096,maxOutputTokens:1800,threads:2,batch:64,reserveMB:1536,abortMB:700,maxModelGB:4,timeoutSeconds:1200,gpuLayers:0},
 larger_host:{contextTokens:8192,maxOutputTokens:2048,threads:6,batch:128,reserveMB:4096,abortMB:1024,maxModelGB:24,timeoutSeconds:900,gpuLayers:-1},
 ubuntu_amd8gb:{contextTokens:8192,maxOutputTokens:2048,threads:4,batch:128,reserveMB:3072,abortMB:1024,maxModelGB:7,timeoutSeconds:600,gpuLayers:-1},
};
export function inferenceSettings(config={},environment=process.env){
 const host=environment===process.env?inferenceHost():null;
 const name=host?.profile||environment.PLATFORM_INFERENCE_PROFILE||'windows_safe',profile=inferenceProfiles[name]||inferenceProfiles.windows_safe;
 const limit=(key,base,min,max)=>Math.max(min,Math.min(max,Number(environment[key])||base));
 const maxContext=limit('PLATFORM_INFERENCE_MAX_CONTEXT',profile.contextTokens,1024,32768);
 return {name,...profile,timeoutSeconds:limit('PLATFORM_INFERENCE_TIMEOUT_SECONDS',profile.timeoutSeconds,30,3600),remote:host?.remote??environment.PLATFORM_INFERENCE_REMOTE==='true',maxModelGB:limit('PLATFORM_INFERENCE_MAX_MODEL_GB',profile.maxModelGB,1,24),contextTokens:Math.max(1024,Math.min(maxContext,Number(config.contextTokens)||profile.contextTokens)),maxOutputTokens:Math.max(128,Math.min(profile.maxOutputTokens,Number(config.maxOutputTokens)||profile.maxOutputTokens)),reserveMB:limit('PLATFORM_INFERENCE_RESERVE_MB',profile.reserveMB,1024,16384),thinking:false};
}
export const resourceWait=(message,admission)=>Object.assign(new AppError(503,message,'inference_resource_wait'),{admission});
export function memoryAdmission({freeBytes,modelBytes,resident=false,settings}){
 if(modelBytes>settings.maxModelGB*1e9)return {ok:false,message:`This model exceeds the ${settings.name} profile’s size limit. Move inference to the larger host before using it.`};
 // Account for weights, runtime buffers and context. This is an admission estimate,
 // not a guarantee of peak memory; an active-request low-memory guard also runs.
 const required=settings.reserveMB*MiB+(resident||settings.remote?0:modelBytes*1.15+512*MiB+settings.contextTokens*65536);
 const requiredMB=Math.ceil(required/MiB),freeMB=Math.floor(freeBytes/MiB),shortfallMB=Math.max(0,requiredMB-freeMB);
 return {ok:freeBytes>=required,requiredMB,freeMB,shortfallMB,resident,message:`Memory reserve protected: ${(freeMB/1024).toFixed(1)} GiB available; ${(requiredMB/1024).toFixed(1)} GiB needed${shortfallMB?` (${(shortfallMB/1024).toFixed(1)} GiB short)`:''}. Close unused apps; generation retries automatically. Scheduled publishing continues independently.`};
}
export function createLocalInferenceGate({memory=freemem,request=remoteJSON,monitorMs=2000}={}){
 let tail=Promise.resolve(),active=0,last=null;
 const inspect=async(provider,model,config)=>{
  assertModelUse({config:{...config,model}});
  const settings=inferenceSettings(config),options={localOrigin:provider.localOrigin||new URL(provider.base).origin,timeout:10000};
  const [tags,ps,info]=await Promise.all([request(provider.base+'/api/tags',options),request(provider.base+'/api/ps',options),request(provider.base+'/api/show',{...options,method:'POST',headers:{'content-type':'application/json'},body:{model}})]);
  if(info.thinking?.values?.length&&info.thinking.values.every(value=>value!==false&&value!=='none'))throw new AppError(400,'This checkpoint requires thinking. Select an explicit Instruct/non-thinking model for caption generation.');
  if(info.capabilities?.length&&!info.capabilities.includes('completion'))throw new AppError(400,'Choose a chat/completion model for captions; this model provides other capabilities.');
  const found=tags.models?.find(m=>m.name===model||m.model===model);
  if(!found)throw new AppError(400,'Download the selected local model on the inference host first.');
  // Ollama may report a loaded alias by its other name. A matching nonempty
  // digest identifies the same checkpoint without counting its weights twice.
  const resident=ps.models?.some(m=>m.name===model||m.model===model||found.digest&&m.digest===found.digest)||false;
  const decision=memoryAdmission({freeBytes:memory(),modelBytes:found.size,resident,settings});
  last={...decision,profile:settings.name,model,at:new Date().toISOString()};
  if(!decision.ok)throw resourceWait(decision.message,last);
  return {...settings,selectedModel:model};
 };
 const check=async(provider,model,config={})=>{try{
  try{return await inspect(provider,model,config);}catch(primaryError){
   const fallback=String(config.fallbackModel||'');
   if(primaryError.code!=='inference_resource_wait'||!config.automaticFallback||fallback===model||!fallback||!(/^[a-zA-Z0-9_.:/@-]{1,160}$/).test(fallback)||ollamaCloudModel(fallback))throw primaryError;
   try{const settings=await inspect(provider,fallback,config);return {...settings,fallbackFrom:model};}
   catch(fallbackError){
    if(fallbackError.code==='inference_resource_wait'&&fallbackError.admission?.requiredMB<primaryError.admission?.requiredMB)throw fallbackError;
    if(primaryError.admission)last=primaryError.admission;throw primaryError;
   }
  }
 }catch(error){
  if([502,503,504].includes(error.status)&&error.code!=='inference_resource_wait'&&(!error.upstreamStatus||error.upstreamStatus>=500))throw new AppError(503,error.status===504?'The local model exceeded its response time budget. Preparation stays queued for retry; booked publishing continues.':'The local inference host is unavailable. Preparation stays queued; booked publishing continues.','inference_host_wait');
  throw error;
 }};
 return {
  check,
  async run(provider,model,config,fn){
   const previous=tail;let release;tail=new Promise(resolve=>release=resolve);await previous;
   let monitor;
   try{
    await inferenceIdle.releaseExcept(provider,model);
    const settings=await check(provider,model,config);
    const controller=new AbortController();active++;
    monitor=setInterval(()=>{if(memory()<settings.abortMB*MiB)controller.abort(resourceWait('Generation stopped at the low-memory threshold. It remains queued for a later retry.'));},monitorMs);monitor.unref?.();
    try{return await fn({settings,signal:controller.signal});}finally{active--;}
   }catch(error){
    if(error.code==='inference_resource_wait')throw error;
    if([502,503,504].includes(error.status)&&(!error.upstreamStatus||error.upstreamStatus>=500))throw new AppError(503,error.status===504?'The local model exceeded its response time budget. Preparation stays queued for retry; booked publishing continues.':'The local inference host is unavailable. Preparation stays queued; booked publishing continues.','inference_host_wait');
    throw error;
   }finally{clearInterval(monitor);release();}
  },
  status:()=>({profile:inferenceSettings().name,totalMB:Math.floor(totalmem()/MiB),freeMB:Math.floor(memory()/MiB),active,lastAdmission:last}),
 };
}
export const localInferenceGate=createLocalInferenceGate();
