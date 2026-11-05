import '../src/env.mjs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
let command='vercel',args=['deploy','--prod','--yes'];
if(process.platform==='win32'){
  const root=path.join(process.env.APPDATA,'npm/node_modules/vercel');
  const manifest=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
  command=process.execPath;args.unshift(path.resolve(root,typeof manifest.bin==='string'?manifest.bin:manifest.bin.vercel));
}
const child=spawn(command,args,{cwd:process.cwd(),env:process.env,stdio:'inherit',windowsHide:true});
child.on('error',()=>{console.error('Vercel CLI is unavailable; install vercel@65.4.0.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
