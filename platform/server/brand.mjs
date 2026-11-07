import {analyzeProduct} from './product-analysis.mjs';
import sharp from 'sharp';
export function logoAssetFor(page,product){
 const dark=product?analyzeProduct(product).type==='apparel':['news','blog'].includes(page.kind);
 return (dark?page.brand?.logoLightAssetId:page.brand?.logoDarkAssetId)||page.brand?.logoAssetId;
}
export async function productLogo(bytes,{dark=false,mode='original',width=104}){
 let image=sharp(bytes,{limitInputPixels:10000000}).ensureAlpha();
 // Monochrome variants retain the supplied mark's alpha and geometry. White
 // edge-connected backgrounds on opaque uploads are not silently removed.
 const stats=await sharp(bytes,{limitInputPixels:10000000}).stats();
 if(mode==='adaptive'&&stats.channels[3]?.min<255){
  const alpha=await image.extractChannel('alpha').toBuffer();
  const {width:w,height:h}=await sharp(bytes).metadata();
  const recolored=await sharp({create:{width:w,height:h,channels:3,background:dark?'#ffffff':'#172d33'}}).joinChannel(alpha).png().toBuffer();
  image=sharp(recolored);
 }
 return image.trim().resize(Math.round(width),Math.round(width*.65),{fit:'inside'}).png().toBuffer();
}
