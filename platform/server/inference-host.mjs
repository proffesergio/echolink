import {readFileSync} from 'node:fs';
import {writeFile,mkdir} from 'node:fs/promises';
import {remoteJSON} from './net.mjs';
import {AppError} from './errors.mjs';
import {totalmem} from 'node:os';
const file=new URL('../.local/inference-host.json',import.meta.url);
let cached;
export function validateInferenceHost(data){
 let url;try{url=new URL(data.url);}catch{throw new AppError(400,'Enter the Ollama server origin, for example http://127.0.0.1:11434.');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.port==='0')throw new AppError(400,'Use an HTTP(S) origin without paths or embedded credentials.');
 if(!['windows_safe','windows_quality','ubuntu_amd8gb','larger_host'].includes(data.profile))throw new AppError(400,'Choose an inference safety profile.');
 const remote=!['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(!remote&&!['windows_safe','windows_quality'].includes(data.profile)&&process.platform==='win32'&&(data.profile!=='larger_host'||totalmem()<24*1024**3))throw new AppError(400,'Keep Windows safe mode on this PC. Larger-host mode on Windows requires at least 24 GiB RAM, or connect a separate inference host.');
 return {url:url.origin,profile:data.profile,remote};
}
export function inferenceHost(){
 if(process.env.NODE_TEST_CONTEXT||process.env.PLATFORM_TEST_MODE==='true')return {url:process.env.PLATFORM_OLLAMA_URL||'http://127.0.0.1:11434',profile:process.env.PLATFORM_INFERENCE_PROFILE||'windows_safe',remote:false};
 if(cached===undefined){try{cached=validateInferenceHost(JSON.parse(readFileSync(file,'utf8')));}catch{cached=null;}}
 return cached||{url:process.env.PLATFORM_OLLAMA_URL||'http://127.0.0.1:11434',profile:process.env.PLATFORM_INFERENCE_PROFILE||'windows_safe',remote:process.env.PLATFORM_INFERENCE_REMOTE==='true'};
}
export async function inspectInferenceHost(data=inferenceHost()){
 const host=validateInferenceHost(data),result=await remoteJSON(host.url+'/api/tags',{localOrigin:host.url,timeout:10000,maxBytes:500000});
 return {...host,models:(result.models||[]).slice(0,100).map(m=>({name:m.name,size:m.size,parameterSize:m.details?.parameter_size,quantization:m.details?.quantization_level})),remoteMemoryMeasured:false};
}
export async function saveInferenceHost(data){
 const host=validateInferenceHost(data);await mkdir(new URL('../.local/',import.meta.url),{recursive:true});
 // Owner-only operator configuration. Tenant connection JSON cannot change it.
 await writeFile(file,JSON.stringify(host,null,2),{mode:0o600});cached=host;return {ok:true,...host,message:'Inference host saved. Page model connections use this host for future requests.'};
}
