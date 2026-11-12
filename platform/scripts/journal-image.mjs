// Offline export only. Does not upload, call a model, publish or contact a server.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {prepareJournalImages} from '../server/journal-images.mjs';
const [input,output,alt]=process.argv.slice(2);
if(!input||!output||!alt)throw Error('Usage: node platform/scripts/journal-image.mjs INPUT OUTPUT_DIRECTORY "Descriptive alt text"');
const prepared=await prepareJournalImages(await readFile(input),{alt}),dir=path.resolve(output);await mkdir(dir,{recursive:true});
for(const variant of prepared.variants)await writeFile(path.join(dir,variant.filename),variant.bytes,{flag:'wx'});
await writeFile(path.join(dir,'manifest.json'),JSON.stringify({type:'image',alt:prepared.alt,width:prepared.width,height:prepared.height,src:prepared.variants.at(-1).filename,variants:prepared.variants.map(({bytes,...v})=>v)},null,2),{flag:'wx'});
console.log('Exported responsive WebP images and alt-text manifest. Upload to your own media storage before attaching public URLs to an article.');
