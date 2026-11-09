import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {AppError} from './errors.mjs';
import {inspectProductPhoto} from './product-photo.mjs';
import {analyzeProduct} from './product-analysis.mjs';
const python=()=>process.env.PLATFORM_REMBG_PYTHON||fileURLToPath(new URL('../.local/rembg-venv/'+(process.platform==='win32'?'Scripts/python.exe':'bin/python'),import.meta.url));
export const cutoutAvailable=()=>existsSync(python());
export async function removeProductBackground(bytes,{product}={}){
 const original=await inspectProductPhoto(bytes);
 if(original.usableCutout)return {bytes,method:'original-transparent',quality:original};
 if(!cutoutAvailable())throw new AppError(503,'Local background removal is not installed. Run the creative-tools setup on the worker PC.');
 const model=['u2netp','u2net','isnet-general-use'].includes(process.env.PLATFORM_REMBG_MODEL)?process.env.PLATFORM_REMBG_MODEL:existsSync(fileURLToPath(new URL('../.local/models/rembg/isnet-general-use.onnx',import.meta.url)))?'isnet-general-use':'u2netp';
 if(!existsSync(fileURLToPath(new URL('../.local/models/rembg/'+model+'.onnx',import.meta.url))))throw new AppError(503,'The selected cutout model is not installed. Install it with the creative-tools setup; the original photo is retained.');
 const output=await new Promise((resolve,reject)=>{
  const child=spawn(python(),[fileURLToPath(new URL('../scripts/remove-background.py',import.meta.url))],{windowsHide:true,env:{...process.env,PLATFORM_REMBG_MODEL:model,PLATFORM_CUTOUT_KIND:product?(/\bsocks?\b|মোজা/iu.test(product.title||'')?'socks':analyzeProduct(product).type):'general',OMP_NUM_THREADS:'2',NUMBA_NUM_THREADS:'2',U2NET_HOME:fileURLToPath(new URL('../.local/models/rembg/',import.meta.url))},stdio:['pipe','pipe','pipe']});
  let length=0;const chunks=[],timer=setTimeout(()=>{child.kill();reject(new AppError(504,'Background removal timed out; retain the original photo or retry.'));},90000);
  child.stdout.on('data',chunk=>{length+=chunk.length;if(length>20_000_000){child.kill();}else chunks.push(chunk);});child.stderr.resume();child.stdin.on('error',()=>{});
  child.on('error',()=>{clearTimeout(timer);reject(new AppError(503,'The local background-removal process could not start.'));});
  child.on('exit',code=>{clearTimeout(timer);if(code===0&&length>100&&length<=20_000_000)resolve(Buffer.concat(chunks));else reject(new AppError(422,'The product cutout needs review. The original photo is retained.'));});child.stdin.end(bytes);
 });
 const quality=await inspectProductPhoto(output);if(!quality.usableCutout)throw new AppError(422,'The cutout mask did not pass edge and subject-coverage checks. The complete original photo is retained.');
 return {bytes:output,method:model+'-local',quality};
}
