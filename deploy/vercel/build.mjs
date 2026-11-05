import {mkdir,copyFile,access} from 'node:fs/promises';
const output=new URL('./public/admin/',import.meta.url);
await mkdir(output,{recursive:true});
for(const name of ['index.html','app.js','cms.js','connections.js','style.css','favicon.svg']){
  const source=new URL('../../src/ui/'+name,import.meta.url),target=new URL(name,output);
  let present=true;try{await access(source);}catch{present=false;}
  if(present)await copyFile(source,target);else await access(target);
}
console.log('Vercel dashboard built: static UI only; credentials remain on the local worker.');
