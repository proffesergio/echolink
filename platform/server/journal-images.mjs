import sharp from 'sharp';
import {AppError} from './errors.mjs';
export async function prepareJournalImages(bytes,{alt}={}){
 if(!Buffer.isBuffer(bytes)||bytes.length>12000000||typeof alt!=='string'||!alt.trim()||alt.length>250)throw new AppError(400,'Choose an image under12MB and supply descriptive alt text.');
 const input=sharp(bytes,{limitInputPixels:20000000}).rotate(),metadata=await input.metadata();
 if(!metadata.width||!metadata.height||metadata.pages>1)throw new AppError(400,'Use a single still image.');
 const variants=[];
 for(const width of [480,800,1200].filter(w=>w<metadata.width).concat(Math.min(1200,metadata.width))){
  if(variants.some(v=>v.width===width))continue;
  const {data,info}=await input.clone().resize({width,withoutEnlargement:true}).webp({quality:84}).toBuffer({resolveWithObject:true});
  variants.push({bytes:data,width:info.width,height:info.height,filename:'image-'+info.width+'.webp'});
 }
 return {alt:alt.trim(),width:variants.at(-1).width,height:variants.at(-1).height,variants};
}
