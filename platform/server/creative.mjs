import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {outbound} from './net.mjs';
import {AppError} from './errors.mjs';
export const ratios={'1:1':[1080,1080],'4:5':[1080,1350],'9:16':[1080,1920],'16:9':[1280,720]};
export function rasterImage(bytes){return Buffer.isBuffer(bytes)&&(bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))||bytes[0]===255&&bytes[1]===216&&bytes[2]===255||bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'||['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString()));}
const escape=s=>String(s||'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
function lines(text,max=27){const words=String(text||'').split(/\s+/),result=[''];for(const word of words){if((result.at(-1)+' '+word).length>max)result.push(word);else result[result.length-1]+=(result.at(-1)?' ':'')+word;}return result.slice(0,4);}
async function typography(text,{width,height,size=48,color='#17242a',weight='bold'}){
 return sharp({text:{text:`<span foreground="${color}" weight="${weight}">${escape(text)}</span>`,font:`Nirmala UI ${size}`,width,rgba:true,wrap:'word-char',spacing:8}}).resize({width,height,fit:'inside',withoutEnlargement:true}).png().toBuffer();
}
export async function renderCreative({post,page,product,background,sourcePhoto,brandLogo}){
 const [width,height]=ratios[post.creative.ratio]||ratios['1:1'],accent=page.brand?.color||'#d75f49',news=['news','blog'].includes(post.type)&&!product,portrait=height>width,landscape=width>height,ink=news?'#f7f6ef':'#18262b',muted=news?'#bcc5c7':'#657377';
 const imageURL=product?.image_url||post.creative.sourceImage;let image=sourcePhoto;
 if(imageURL&&!image){const r=await outbound(imageURL,{maxBytes:12_000_000});if(!r.ok)throw new AppError(502,'The source photo could not be downloaded. Choose another photo or a text-only creative.');image=r.bytes;}
 if(image&&!rasterImage(image)||background&&!rasterImage(background)||brandLogo&&!rasterImage(brandLogo))throw new AppError(400,'Use a PNG, JPEG, WebP or GIF source image.');
 const layers=[],pad=Math.round(width*.06),headerY=50;
 const base=`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="studio" cx="75%" cy="36%" r="85%"><stop stop-color="#ffffff"/><stop offset=".62" stop-color="#f1eee5"/><stop offset="1" stop-color="#dce6df"/></radialGradient><linearGradient id="editorial" x2=".7" y2="1"><stop stop-color="#102a30"/><stop offset="1" stop-color="#111a22"/></linearGradient><radialGradient id="shadow"><stop stop-color="#17242a" stop-opacity=".22"/><stop offset="1" stop-color="#17242a" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="${news?'url(#editorial)':'url(#studio)'}"/>${news?`<rect x="${pad}" y="123" width="${width-pad*2}" height="2" fill="#ffffff" opacity=".15"/>`:`<circle cx="${width*.86}" cy="${height*.36}" r="${width*.39}" fill="${accent}" opacity=".065"/><path d="M ${width*.46} ${height*.83} Q ${width*.8} ${height*.61} ${width} ${height*.78} L ${width} ${height} L ${width*.46} ${height} Z" fill="#ffffff" opacity=".3"/>`}</svg>`;
 layers.push({input:Buffer.from(base),left:0,top:0});
 if(background&&!news){layers.push({input:await sharp(background,{limitInputPixels:40000000}).resize(width,height,{fit:'cover'}).png().toBuffer(),left:0,top:0});layers.push({input:Buffer.from(`<svg width="${width}" height="${height}"><defs><linearGradient id="readable"><stop stop-color="#f7f5ed" stop-opacity=".96"/><stop offset=".48" stop-color="#f7f5ed" stop-opacity=".84"/><stop offset="1" stop-color="#f7f5ed" stop-opacity=".12"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#readable)"/></svg>`),left:0,top:0});}
 // Preserve the original logo colours and alpha. A compact contrast plate is
 // chosen from the artwork; no forced recolouring or oversized white sticker.
 let brandX=pad;
 if(brandLogo){
  const originalStats=await sharp(brandLogo,{limitInputPixels:10000000}).stats(),cropped=await sharp(brandLogo,{limitInputPixels:10000000}).trim().png().toBuffer(),stats=await sharp(cropped).stats(),bright=stats.channels.slice(0,3).reduce((sum,c)=>sum+c.mean,0)/3>170,opaque=originalStats.channels.length<4||originalStats.channels[3].min===255,corner=await sharp(cropped).extract({left:0,top:0,width:1,height:1}).removeAlpha().raw().toBuffer(),plate=opaque&&corner[0]+corner[1]+corner[2]<100?'#111111':bright?'#17313a':'#ffffff';
  const logo=await sharp(cropped).resize(104,48,{fit:'inside',withoutEnlargement:false}).png().toBuffer(),m=await sharp(logo).metadata();
  layers.push({input:Buffer.from(`<svg width="128" height="68"><rect width="128" height="68" rx="12" fill="${plate}"/></svg>`),left:pad,top:30});
  layers.push({input:logo,left:pad+Math.round((128-m.width)/2),top:30+Math.round((68-m.height)/2)});brandX=pad+148;
 }
 layers.push({input:await typography(page.brand?.name||page.name,{width:width-brandX-pad,height:42,size:26,color:ink}),left:brandX,top:headerY});
 let photo,headline;
 if(news){
  photo=landscape?{x:Math.round(width*.49),y:155,w:Math.round(width*.46),h:height-235}:{x:pad,y:155,w:width-2*pad,h:Math.round(height*.47)};
  headline=landscape?{x:pad,y:225,w:Math.round(width*.37),h:height-330}:{x:pad,y:photo.y+photo.h+48,w:width-2*pad,h:height-photo.y-photo.h-160};
 }else{
  photo=portrait?{x:Math.round(width*.13),y:340,w:Math.round(width*.74),h:Math.round(height*.47)}:{x:Math.round(width*.47),y:Math.round(height*.2),w:Math.round(width*.48),h:Math.round(height*.64)};
  headline=portrait?{x:pad,y:160,w:width-2*pad,h:160}:{x:pad,y:Math.round(height*.24),w:Math.round(width*.38),h:Math.round(height*.3)};
 }
 if(image){
  if(!news)layers.push({input:Buffer.from(`<svg width="${photo.w}" height="100"><defs><radialGradient id="s"><stop stop-color="#17242a" stop-opacity=".2"/><stop offset="1" stop-color="#17242a" stop-opacity="0"/></radialGradient></defs><ellipse cx="${photo.w/2}" cy="50" rx="${photo.w*.45}" ry="38" fill="url(#s)"/></svg>`),left:photo.x,top:Math.min(height-160,photo.y+photo.h-55)});
  const input=sharp(image,{limitInputPixels:40000000}).rotate();if(!news&&(await sharp(image).metadata()).hasAlpha)input.trim();
  const bytes=await input.resize(photo.w,photo.h,{fit:news?'cover':'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  layers.push({input:bytes,left:photo.x,top:photo.y});
 }
 const title=post.creative.headline||post.title;
 layers.push({input:await typography(title,{width:headline.w,height:Math.max(80,headline.h),size:news?58:56,color:ink}),left:headline.x,top:headline.y});
 if(product?.price!==null&&product?.price!==undefined){
  const price=`${product.currency||''} ${new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(product.price))}`;
  layers.push({input:await typography(price,{width:Math.round(width*.42),height:66,size:54,color:ink}),left:pad,top:portrait?height-225:Math.round(height*.65)});
 }
 const cta=post.creative.cta||(news?(page.language==='English'?'THE STORY, CLEARLY':'সংবাদ সংক্ষেপ'):page.creative_policy?.goal==='sales'?'Explore & order':'Message us for details');
 const footerY=height-110,footerWidth=Math.min(width-pad*2,news?width-pad*2:420);
 if(!news)layers.push({input:Buffer.from(`<svg width="${footerWidth}" height="66"><rect width="100%" height="100%" rx="33" fill="#182c31"/></svg>`),left:pad,top:footerY});
 layers.push({input:await typography(cta,{width:footerWidth-40,height:40,size:news?23:25,color:news?muted:'#ffffff'}),left:pad+(news?0:22),top:footerY+17});
 if(news)layers.push({input:Buffer.from(`<svg width="${width}" height="8"><rect width="${width}" height="8" fill="${accent}"/></svg>`),left:0,top:height-8});
 const output=sharp({create:{width,height,channels:4,background:'#ffffff'}}).composite(layers).jpeg({quality:93,mozjpeg:true});
 if(background&&!news)output.withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"><Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType></rdf:Description></rdf:RDF></x:xmpmeta>');
 return {bytes:await output.toBuffer(),width,height,sourcePhotoUsed:!!image,designVersion:'studio-v2'};
}
export async function saveAsset(workspaceId,postId,creative){
 const id=randomUUID(),mime=creative.mime||'image/jpeg',dir=new URL('../.local/assets/'+workspaceId+'/',import.meta.url);await mkdir(dir,{recursive:true});const path=new URL(id+(mime==='image/png'?'.png':'.jpg'),dir);await writeFile(path,creative.bytes);return {id,path:fileURLToPath(path),mime,width:creative.width,height:creative.height};
}
