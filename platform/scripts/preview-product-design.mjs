import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {renderCreative} from '../server/creative.mjs';
import {removeProductBackground} from '../server/cutout.mjs';
import {outbound} from '../server/net.mjs';
import sharp from 'sharp';
const fixture=new URL('../../.codex/references/fabrything-nov08/catalogue.json',import.meta.url),input=JSON.parse(await readFile(fixture,'utf8')),directory=new URL('../.local/verification/fabrything-products-v7/',import.meta.url);await mkdir(directory,{recursive:true});
const logo=await readFile(input.logoPath),results=[];
for(const [i,product]of input.products.entries()){
 const response=await outbound(product.image_url,{maxBytes:12000000});if(!response.ok)throw new Error('Product preview photo unavailable.');const original=response.bytes;await writeFile(new URL('source-'+i+'.jpg',directory),original);
 let sourcePhoto=original,cutout='original-photo',quality,warning;const started=Date.now();
 try{const result=await removeProductBackground(original,{product});sourcePhoto=result.bytes;cutout=result.method;quality=result.quality;await writeFile(new URL('cutout-'+i+'.png',directory),sourcePhoto);}catch(e){warning=e.message;}
 const image=await renderCreative({post:{title:product.title,creative:{ratio:'4:5',style:'editorial'}},page:input.page,product,sourcePhoto,brandLogo:logo,website:{url:'https://fabrything.com'}}),file='product-'+i+'.jpg';await writeFile(new URL(file,directory),image.bytes);
 const result={file,title:product.title,category:product.attributes.category,direction:image.analysis.design.key,photoMode:image.photoMode,cutout,quality,warning,seconds:Math.round((Date.now()-started)/100)/10,heroBounds:image.heroBounds,visibleText:image.visibleText};results.push(result);console.log(JSON.stringify(result));
}
await writeFile(new URL('results.json',directory),JSON.stringify(results,null,2));
const thumbs=[];for(const r of results)thumbs.push(await sharp(await readFile(new URL(r.file,directory))).resize(360,450).toBuffer());
const columns=3,rows=Math.ceil(thumbs.length/columns);await sharp({create:{width:1080,height:450*rows,channels:3,background:'#e8e8e3'}}).composite(thumbs.map((input,i)=>({input,left:i%columns*360,top:Math.floor(i/columns)*450}))).jpeg({quality:92}).toFile(fileURLToPath(new URL('contact-sheet.jpg',directory)));
console.log(JSON.stringify({previewOnly:true,realPublications:0,output:fileURLToPath(directory)}));
