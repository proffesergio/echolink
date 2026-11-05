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
export async function renderCreative({post,page,product,background,sourcePhoto,brandLogo}){
 const [width,height]=ratios[post.creative.ratio]||ratios['1:1'],color=page.brand?.color||'#ff765e',bold=post.creative.style==='bold',light=post.creative.style==='minimal',bg=light?'#f5efe7':'#15181c',ink=light?'#191b20':'#ffffff';
 const imageURL=product?.image_url||post.creative.sourceImage;let image=sourcePhoto;
 if(imageURL&&!image){const r=await outbound(imageURL,{maxBytes:12_000_000});if(!r.ok)throw new AppError(502,'The source photo could not be downloaded. Update the source or choose a text-only creative.');image=r.bytes;}
 if(image&&!rasterImage(image)||background&&!rasterImage(background)||brandLogo&&!rasterImage(brandLogo))throw new AppError(400,'Use a PNG, JPEG, WebP or GIF source image. SVG and document inputs are not accepted.');
 const newsSquare=post.type==='news'&&width===height;
 const picture=newsSquare?[width-140,Math.round(height*.48)]:height>width?[width-140,Math.round(height*.45)]:[Math.round(width*.5),height-190];
 const left=newsSquare||height>width?70:width-picture[0]-50,top=newsSquare?140:height>width?170:90;
 const overlays=[];
 if(background)overlays.push({input:await sharp(background,{limitInputPixels:40000000}).resize(width,height,{fit:'cover'}).modulate({brightness:0.3}).png().toBuffer(),left:0,top:0});
 if(image)overlays.push({input:await sharp(image,{limitInputPixels:40000000}).rotate().resize(...picture,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer(),left,top});
 if(brandLogo)overlays.push({input:await sharp(brandLogo,{limitInputPixels:10000000}).flatten({background:'#ffffff'}).resize(100,76,{fit:'contain',background:'#ffffff'}).extend({top:8,bottom:8,left:10,right:10,background:'#ffffff'}).png().toBuffer(),left:50,top:35});
 const textX=70,textY=newsSquare?740:height>width?Math.round(height*.66):220,font=newsSquare?48:height>width?62:48,max=newsSquare?38:height>width?28:20;
 // Pango wraps shaped glyphs by pixel width, including Bengali combining
 // marks. Character-count wrapping can overflow with different scripts.
 const textTop=newsSquare?710:textY-font,textWidth=newsSquare||height>width?width-140:Math.max(250,left-textX-35),maxTextHeight=Math.max(100,height-(product?210:155)-textTop);
 const headlineImage=await sharp({text:{text:`<span foreground="${ink}" weight="${bold?'heavy':'bold'}">${escape(post.creative.headline||post.title)}</span>`,font:`Nirmala UI ${font}`,width:textWidth,rgba:true,wrap:'word-char'}}).resize({width:textWidth,height:maxTextHeight,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 overlays.push({input:headlineImage,left:textX,top:textTop});
 const headline='';
 const price=product?.price!==null&&product?.price!==undefined?`${product.currency||''} ${new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(product.price))}`:'';
 const ctaInk=parseInt(color.slice(1,3),16)*.299+parseInt(color.slice(3,5),16)*.587+parseInt(color.slice(5,7),16)*.114<135?'#ffffff':'#17191d';
 const priceInk=ctaInk==='#ffffff'&&!light?'#ffffff':color;
 const svg=`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${brandLogo?'':`<rect x="55" y="55" width="7" height="42" fill="${color}"/>`}<text x="${brandLogo?190:82}" y="87" fill="${ink}" font-family="Segoe UI, Nirmala UI, sans-serif" font-size="29" font-weight="700">${escape(page.brand?.name||page.name)}</text><text x="${textX}" y="${textY}" fill="${ink}" font-family="Segoe UI, Nirmala UI, sans-serif" font-size="${font}" font-weight="${bold?900:700}">${headline}</text><text x="70" y="${height-140}" fill="${priceInk}" font-size="40" font-family="Segoe UI, Nirmala UI, sans-serif" font-weight="700">${escape(price)}</text><rect x="65" y="${height-100}" width="350" height="58" rx="18" fill="${color}"/><text x="90" y="${height-62}" font-size="24" fill="${ctaInk}" font-family="Segoe UI, Nirmala UI, sans-serif">${escape(post.creative.cta||(product?'Discover the collection':'Read · Reflect · Share'))}</text></svg>`;
 overlays.push({input:Buffer.from(svg),left:0,top:0});
 return {bytes:await sharp({create:{width,height,channels:4,background:bg}}).composite(overlays).jpeg({quality:90}).toBuffer(),width,height,sourcePhotoUsed:!!image};
}
export async function saveAsset(workspaceId,postId,creative){
 const id=randomUUID(),mime=creative.mime||'image/jpeg',dir=new URL('../.local/assets/'+workspaceId+'/',import.meta.url);await mkdir(dir,{recursive:true});const path=new URL(id+(mime==='image/png'?'.png':'.jpg'),dir);await writeFile(path,creative.bytes);return {id,path:fileURLToPath(path),mime,width:creative.width,height:creative.height};
}
