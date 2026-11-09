import {remoteJSON} from './net.mjs';
export const ollamaCloudModel=model=>/(?:^|[:/])[^:]*cloud(?:$|:)|:cloud$/i.test(String(model));

export function createInferenceIdleManager({idleMs=30000,clock=()=>Date.now(),unload=async({base,model})=>remoteJSON(base+'/api/generate',{method:'POST',headers:{'content-type':'application/json'},localOrigin:new URL(base).origin,timeout:10000,body:{model,keep_alive:0}})}={}){
 const models=new Map();let timer;
 const keyOf=p=>p.base+'|'+p.model;
 const releaseIdle=async(force=false,except=null)=>{
  for(const [key,state] of models){
   if(except&&state.base===except.base&&state.model===except.model)continue;
   if(state.active||state.unloading||!force&&clock()-state.lastUsed<idleMs)continue;
   const promise=Promise.resolve().then(()=>unload(state));state.unloading=promise;
   try{await promise;if(!state.active)models.delete(key);}
   catch{state.lastUsed=clock();}
   finally{if(models.get(key)===state)state.unloading=null;}
  }
 };
 return {
  async run(provider,model,fn){
   if(provider.id!=='ollama'||ollamaCloudModel(model))return fn();
   const spec={base:provider.base,model},key=keyOf(spec);let state=models.get(key);
   if(state?.unloading)await state.unloading.catch(()=>{});
   state=models.get(key)||{...spec,active:0,lastUsed:clock(),unloading:null};models.set(key,state);state.active++;state.lastUsed=clock();
   if(!timer){timer=setInterval(()=>releaseIdle().catch(()=>{}),Math.max(1000,Math.min(15000,idleMs)));timer.unref?.();}
   try{return await fn();}finally{state.active--;state.lastUsed=clock();}
  },
  releaseIdle,
  releaseExcept:(provider,model)=>releaseIdle(true,{base:provider.base,model}),
  status:()=>({idleSeconds:Math.round(idleMs/1000),activeRequests:[...models.values()].reduce((n,s)=>n+s.active,0),managedModels:models.size}),
  stop(){clearInterval(timer);timer=undefined;},
 };
}
const seconds=Number(process.env.PLATFORM_INFERENCE_IDLE_SECONDS||30);
export const inferenceIdle=createInferenceIdleManager({idleMs:Math.max(5,Math.min(600,Number.isFinite(seconds)?seconds:30))*1000});
