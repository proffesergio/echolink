import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {AppError} from './errors.mjs';
const python=()=>process.env.PLATFORM_REMBG_PYTHON||fileURLToPath(new URL('../.local/rembg-venv/'+(process.platform==='win32'?'Scripts/python.exe':'bin/python'),import.meta.url));
export const cutoutAvailable=()=>existsSync(python());
export async function removeProductBackground(bytes){
 const metadata=await sharp(bytes,{limitInputPixels:40_000_000}).metadata();
 if(metadata.hasAlpha){const stats=await sharp(bytes).stats(),alpha=stats.channels.at(-1);if(alpha.min<200&&alpha.max>200)return {bytes,method:'original-transparent'};}
 if(!cutoutAvailable())throw new AppError(503,'Local background removal is not installed. Run the creative-tools setup on the worker PC.');
 return new Promise((resolve,reject)=>{
  const child=spawn(python(),[fileURLToPath(new URL('../scripts/remove-background.py',import.meta.url))],{windowsHide:true,env:{...process.env,OMP_NUM_THREADS:'2',NUMBA_NUM_THREADS:'2',U2NET_HOME:fileURLToPath(new URL('../.local/models/rembg/',import.meta.url))},stdio:['pipe','pipe','pipe']});
  let length=0;const chunks=[],timer=setTimeout(()=>{child.kill();reject(new AppError(504,'Background removal timed out; retain the original photo or retry.'));},90000);
  child.stdout.on('data',chunk=>{length+=chunk.length;if(length>20_000_000){child.kill();}else chunks.push(chunk);});child.stderr.resume();child.stdin.on('error',()=>{});
  child.on('error',()=>{clearTimeout(timer);reject(new AppError(503,'The local background-removal process could not start.'));});
  child.on('exit',code=>{clearTimeout(timer);if(code===0&&length>100&&length<=20_000_000)resolve({bytes:Buffer.concat(chunks),method:'u2netp-local'});else reject(new AppError(422,'The product cutout needs review. The original photo is retained.'));});child.stdin.end(bytes);
 });
}
