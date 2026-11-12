import {modelRoute,assertModelUse} from './model-routing.mjs';
export {assertModelUse} from './model-routing.mjs';
import {notificationTypes} from './notifications.mjs';
import {inferenceHost} from './inference-host.mjs';
import {remoteJSON,publicURL,outbound} from './net.mjs';
import {AppError} from './errors.mjs';
import {readFile} from 'node:fs/promises';
import {EDITOR_SYSTEM} from './prompts.mjs';
import {inferenceIdle,ollamaCloudModel} from './inference-idle.mjs';
import {localInferenceGate} from './inference-resources.mjs';
import {operationsTelemetry} from './operations-telemetry.mjs';
import {boundedNewsStage} from './news-stage-budget.mjs';
export const providers=[
 {id:'pollinations',name:'Pollinations · image / speech',capabilities:['image','audio'],defaultURL:'https://gen.pollinations.ai',style:'pollinations'},
 {id:'huggingface',name:'Hugging Face Inference',capabilities:['image'],defaultURL:'https://router.huggingface.co',style:'huggingface'},
 {id:'ollama',name:'Ollama',capabilities:['text'],local:'PLATFORM_OLLAMA_URL',defaultURL:'http://127.0.0.1:11434',style:'openai'},
 {id:'lmstudio',name:'LM Studio',capabilities:['text'],local:'PLATFORM_LM_STUDIO_URL',defaultURL:'http://127.0.0.1:1234',style:'openai'},
 {id:'localai',name:'LocalAI',capabilities:['text','image'],local:'PLATFORM_LOCALAI_URL',defaultURL:'http://127.0.0.1:8080',style:'openai'},
 {id:'comfyui',name:'ComfyUI',capabilities:['image'],local:'PLATFORM_COMFYUI_URL',defaultURL:'http://127.0.0.1:8188',style:'comfy'},
 {id:'a1111',name:'AUTOMATIC1111',capabilities:['image'],local:'PLATFORM_A1111_URL',defaultURL:'http://127.0.0.1:7860',style:'a1111'},
 {id:'openai',name:'OpenAI',capabilities:['text','image'],defaultURL:'https://api.openai.com',style:'openai'},
 {id:'gemini',name:'Google Gemini',capabilities:['text','image'],defaultURL:'https://generativelanguage.googleapis.com',style:'gemini'},
 {id:'anthropic',name:'Anthropic',capabilities:['text'],defaultURL:'https://api.anthropic.com',style:'anthropic'},
 {id:'groq',name:'Groq',capabilities:['text'],defaultURL:'https://api.groq.com/openai',style:'openai'},
 {id:'openrouter',name:'OpenRouter',capabilities:['text'],defaultURL:'https://openrouter.ai/api',style:'openai'},
 {id:'deepseek',name:'DeepSeek',capabilities:['text'],defaultURL:'https://api.deepseek.com',style:'openai'},
 {id:'mistral',name:'Mistral',capabilities:['text'],defaultURL:'https://api.mistral.ai',style:'openai'},
 {id:'together',name:'Together AI',capabilities:['text','image'],defaultURL:'https://api.together.xyz',style:'openai'},
];
export const connectionTypes=[...providers,...notificationTypes,{id:'pexels',name:'Pexels stock photos',capabilities:['stock']},{id:'pixabay',name:'Pixabay stock photos',capabilities:['stock']},{id:'facebook',name:'Facebook Page',capabilities:['publish','insights']},{id:'wordpress',name:'WordPress',capabilities:['website']},{id:'shopify',name:'Shopify Storefront',capabilities:['products']},{id:'woocommerce',name:'WooCommerce',capabilities:['products']},{id:'fabrything_db',name:'Fabrything catalog (owner)',capabilities:['products'],ownerOnly:true},{id:'nobleseek_db',name:'NobleSeek website (owner)',capabilities:['website'],ownerOnly:true},{id:'airtable',name:'Airtable',capabilities:['mirror']},{id:'google_sheets',name:'Google Sheets',capabilities:['mirror']}];
export function providerConfig(connection){
 const p=providers.find(p=>p.id===connection.provider);if(!p)throw new AppError(400,'Select a supported AI tool.');
 const base=p.id==='ollama'?inferenceHost().url:p.local?(process.env[p.local]||p.defaultURL):p.defaultURL;
 // Cloud endpoints are fixed by the adapter. Local origins belong to the
 // operator; tenant JSON can never redirect requests into the host network.
 return {...p,base:base.replace(/\/$/,''),localOrigin:p.local?new URL(base).origin:undefined};
}
const modelOf=c=>{const m=String(c.config.model||'');if(!/^[a-zA-Z0-9_.:/@-]{1,160}$/.test(m))throw new AppError(400,'Configure a valid model identifier.');return m;};
export async function checkTextCapacity(connection,{purpose='general'}={}){
 connection=modelRoute(connection,purpose).connection;assertModelUse(connection);
 const provider=providerConfig(connection),model=modelOf(connection);
 if(provider.id==='ollama'&&!ollamaCloudModel(model))await localInferenceGate.check(provider,model,connection.config);
}
export async function textCompletion(connection,secret,prompt,options={}){
 const start=performance.now();let metrics,error;try{return await performTextCompletion(connection,secret,prompt,{...options,onMetrics:m=>{metrics=m;options.onMetrics?.(m);}});}catch(e){error=e;throw e;}finally{operationsTelemetry.inference({model:metrics?.model||connection.config?.model,purpose:options.purpose||'general',metrics,error,ms:performance.now()-start});}
}
async function performTextCompletion(connection,secret,prompt,{systemPrompt=EDITOR_SYSTEM,onMetrics=()=>{},purpose='general',responseSchema,deadlineMs}={}){
 const routing=modelRoute(connection,purpose,prompt);connection=routing.connection;assertModelUse(connection);
 const provider=providerConfig(connection),model=modelOf(connection);
 if(provider.id==='ollama'&&!ollamaCloudModel(model))return localInferenceGate.run(provider,model,connection.config,({settings,signal})=>{const selectedModel=settings.selectedModel||model;return inferenceIdle.run(provider,selectedModel,async()=>{
  const shortNews=['news_article','news_review'].includes(purpose)&&Number.isFinite(deadlineMs),request=timeout=>remoteJSON(provider.base+'/api/chat',{method:'POST',headers:{'content-type':'application/json',...(secret.apiKey?{authorization:'Bearer '+secret.apiKey}:{})},localOrigin:provider.localOrigin,timeout,maxBytes:2_000_000,signal,body:{model:selectedModel,stream:false,think:false,...(responseSchema?{format:responseSchema}:{}),keep_alive:'30s',messages:[{role:'system',content:systemPrompt},{role:'user',content:prompt}],options:{temperature:Number(connection.config.temperature??0.6),top_p:0.8,top_k:20,num_ctx:settings.contextTokens,num_predict:settings.maxOutputTokens,num_thread:settings.threads,num_batch:settings.batch,num_gpu:settings.gpuLayers}}});
  const data=shortNews?await boundedNewsStage(request,{purpose,deadlineMs:Math.min(deadlineMs,settings.timeoutSeconds*1000)}):await request(settings.timeoutSeconds*1000);
  onMetrics({model:selectedModel,requestedModel:model,purpose,complexity:routing.complexity,routedFrom:routing.routedFrom||null,fallbackFrom:settings.fallbackFrom||null,profile:settings.name,threads:settings.threads,contextTokens:settings.contextTokens,thinking:false,inputTokens:data.prompt_eval_count,outputTokens:data.eval_count,seconds:Math.round((data.total_duration||0)/1e8)/10,tokensPerSecond:data.eval_duration?Math.round(data.eval_count/(data.eval_duration/1e9)*10)/10:null});
  if(data.done_reason==='length')throw new AppError(422,'The caption reached the local output limit. Shorten the brief or raise the limit on a larger inference host.');
  if(!data.message?.content?.trim())throw new AppError(422,'The model returned no final caption. Verify its non-thinking template before using it for this Page.');
  return String(data.message?.content||'').replace(/<think>[\s\S]*?<\/think>/gi,'').trim();
 });});
 if(provider.id==='ollama'&&process.env.PLATFORM_OLLAMA_LOCAL_ONLY!=='false')throw new AppError(400,'This worker uses local Ollama models only. Select a downloaded model.');
 return inferenceIdle.run(provider,model,()=>completeText(connection,secret,prompt,{systemPrompt}));
}
async function completeText(connection,secret,prompt,{systemPrompt}){
 const p=providerConfig(connection),model=modelOf(connection),headers={'content-type':'application/json'},options={headers,method:'POST',localOrigin:p.localOrigin,timeout:240000,maxBytes:2_000_000};
 const temperature=Number(connection.config.temperature??0.4);let data;
 if(p.style==='openai'){
  if(secret.apiKey)headers.authorization='Bearer '+secret.apiKey;
  data=await remoteJSON(p.base+'/v1/chat/completions',{...options,body:{model,temperature,max_tokens:1200,...(p.id==='ollama'&&ollamaCloudModel(model)?{reasoning_effort:'none'}:{}),messages:[{role:'system',content:systemPrompt},{role:'user',content:prompt}]}});
  return String(data.choices?.[0]?.message?.content||'').trim();
 }
 if(p.style==='gemini'){
  headers['x-goog-api-key']=secret.apiKey||'';data=await remoteJSON(p.base+'/v1beta/models/'+encodeURIComponent(model)+':generateContent',{...options,body:{systemInstruction:{parts:[{text:systemPrompt}]},contents:[{parts:[{text:prompt}]}],generationConfig:{temperature,maxOutputTokens:1500}}});return(data.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('').trim();
 }
 if(p.style==='anthropic'){
  headers['x-api-key']=secret.apiKey||'';headers['anthropic-version']='2023-06-01';data=await remoteJSON(p.base+'/v1/messages',{...options,body:{model,max_tokens:1200,system:systemPrompt,temperature,messages:[{role:'user',content:prompt}]}});return(data.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('').trim();
 }
 throw new AppError(400,'This tool generates images. Select a text tool for captions.');
}
export async function imageGeneration(connection,secret,prompt,{width=1024,height=1024}={}){
 const p=providerConfig(connection),headers={'content-type':'application/json'},options={method:'POST',headers,localOrigin:p.localOrigin,timeout:240000,maxBytes:18_000_000};
 if(secret.apiKey)headers.authorization='Bearer '+secret.apiKey;
 if(p.style==='pollinations'){
  if(!secret.apiKey)throw new AppError(400,'Save the Pollinations server API key; generation may use account credits.');
  const url=new URL(p.base+'/image/'+encodeURIComponent(prompt));url.search=new URLSearchParams({model:modelOf(connection),width:String(width),height:String(height)}).toString();const r=await outbound(url.href,{headers,timeout:240000,maxBytes:18_000_000});if(!r.ok)throw new AppError(502,'Pollinations rejected image generation. Check the model, API key and account credits.');return r.bytes;
 }else if(p.style==='huggingface'){
  if(!secret.apiKey)throw new AppError(400,'Save a Hugging Face token with Inference Providers permission.');
  const {InferenceClient}=await import('@huggingface/inference');let blob;try{blob=await new InferenceClient(secret.apiKey).textToImage({model:modelOf(connection),inputs:prompt,parameters:{width,height}},{signal:AbortSignal.timeout(240000)});}catch{throw new AppError(502,'Hugging Face image generation failed. Check model availability, token permissions and provider credits.');}if(blob.size>18_000_000)throw new AppError(413,'The image provider returned too much data.');return Buffer.from(await blob.arrayBuffer());
 }else if(p.style==='a1111'){
  const r=await remoteJSON(p.base+'/sdapi/v1/txt2img',{...options,body:{prompt,width,height,steps:20,batch_size:1}});if(r.images?.[0])return Buffer.from(r.images[0],'base64');
 }else if(p.style==='openai'&&p.capabilities.includes('image')){
  const model=modelOf(connection),payload=p.id==='together'?{model,prompt,n:1,width,height,response_format:'base64'}:{model,prompt,n:1,size:width+'x'+height,...(!model.startsWith('gpt-image')?{response_format:'b64_json'}:{})};
  const r=await remoteJSON(p.base+'/v1/images/generations',{...options,body:payload});
  if(r.data?.[0]?.b64_json)return Buffer.from(r.data[0].b64_json,'base64');
  if(r.data?.[0]?.url){publicURL(r.data[0].url);const response=await outbound(r.data[0].url,{maxBytes:15_000_000});if(response.ok)return response.bytes;}
 }else if(p.style==='gemini'){
  headers['x-goog-api-key']=secret.apiKey||'';delete headers.authorization;
  const r=await remoteJSON(p.base+'/v1beta/models/'+encodeURIComponent(modelOf(connection))+':generateContent',{...options,body:{contents:[{parts:[{text:prompt}]}],generationConfig:{responseModalities:['TEXT','IMAGE']}}});
  const part=r.candidates?.[0]?.content?.parts?.find(x=>x.inlineData?.mimeType?.startsWith('image/'));if(part)return Buffer.from(part.inlineData.data,'base64');
 }else if(p.style==='comfy'){
  // The operator installs an API workflow with a text node and output node.
  let template;
  if(connection.config.trustedWorkflow===true)template={workflow:connection.config.workflow,promptNode:connection.config.promptNode};
  else if(process.env.PLATFORM_COMFYUI_WORKFLOW_PATH)try{template=JSON.parse(await readFile(process.env.PLATFORM_COMFYUI_WORKFLOW_PATH,'utf8'));}catch{throw new AppError(503,'The operator’s ComfyUI workflow template could not be loaded.');}
  const workflow=structuredClone(template?.workflow);const promptNode=template?.promptNode;
  if(!workflow?.[promptNode]?.inputs)throw new AppError(400,'Import a ComfyUI API workflow and set its prompt node ID.');
  workflow[promptNode].inputs.text=prompt;
  const job=await remoteJSON(p.base+'/prompt',{...options,body:{prompt:workflow}});
  for(let i=0;i<90;i++){
   await new Promise(resolve=>setTimeout(resolve,2000));const history=await remoteJSON(p.base+'/history/'+encodeURIComponent(job.prompt_id),{localOrigin:p.localOrigin});
   const output=Object.values(history[job.prompt_id]?.outputs||{}).flatMap(x=>x.images||[])[0];
   if(output){const url=new URL(p.base+'/view');for(const key of ['filename','subfolder','type'])if(output[key])url.searchParams.set(key,output[key]);const r=await outbound(url.href,{localOrigin:p.localOrigin,maxBytes:15_000_000});if(r.ok)return r.bytes;}
   if(history[job.prompt_id]?.status?.status_str==='error')throw new AppError(502,'The ComfyUI workflow failed. Inspect the local ComfyUI console.');
  }
  throw new AppError(504,'ComfyUI is still preparing the image. Check its queue before resubmitting.');
 }
 throw new AppError(502,'The image tool did not return an image. Check its model, supported size and configuration.');
}
export async function testAI(connection,secret){
 const p=providerConfig(connection);
 if(p.capabilities.includes('text')){const reply=await textCompletion({...connection,config:{...connection.config,automaticRouting:false}},secret,'Reply with just: Connection ready');if(!reply)throw new AppError(502,'The model returned an empty response.');return {ok:true,message:'The text model responded.',sample:reply.slice(0,150)};}
 const path=p.style==='comfy'?'/system_stats':p.style==='a1111'?'/sdapi/v1/options':null;
 if(!path)throw new AppError(400,'This image provider is checked by generating a reviewed image, which may cost credits.');
 await remoteJSON(p.base+path,{localOrigin:p.localOrigin});return {ok:true,message:'Image server reachable. Generation still needs a loaded model.'};
}
