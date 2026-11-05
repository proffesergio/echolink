import {mkdir,copyFile,access,cp} from 'node:fs/promises';
const output=new URL('./public/admin/',import.meta.url);
await mkdir(output,{recursive:true});
for(const name of ['index.html','app.js','cms.js','connections.js','style.css','favicon.svg']){
  const source=new URL('../../src/ui/'+name,import.meta.url),target=new URL(name,output);
  let present=true;try{await access(source);}catch{present=false;}
  if(present)await copyFile(source,target);else await access(target);
}
const platform=new URL('../../platform/dist/',import.meta.url);
try{await access(new URL('index.html',platform));await cp(platform,new URL('./public/',import.meta.url),{recursive:true});}
catch(error){if(error.code!=='ENOENT')throw error;await access(new URL('./public/index.html',import.meta.url));}
console.log('Vercel creator dashboard built; protected API proxy connects to the Windows worker.');
