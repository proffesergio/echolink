import {fontOptions} from './fonts.mjs';
import {analyzeProduct} from './product-analysis.mjs';
import {productLogo} from './brand.mjs';
import {prepareProductPhoto} from './product-photo.mjs';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
export const PRODUCT_DESIGN_VERSION='product-v7';
const escape=s=>String(s||'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export const productCallouts=product=>analyzeProduct(product).callouts;
export function shortProductTitle(value){
 const title=String(value||'').replace(/\bFabrilife\b/gi,'').replace(/\([^)]*\)/g,'').replace(/\b(?:premium quality|premium|antibacterial|for men|for women|men[’']?s|women[’']?s|wonen[’']?s|blank)\b/gi,'').replace(/(?:৳|[$€£]|\b(?:BDT|USD|TK)\s*)\s*[\d০-৯,.]+/giu,'').replace(/\s+/g,' ').trim().replace(/^[-–:| ]+|[-–:| ]+$/g,'');
 let result='';for(const word of title.split(' ').slice(0,6)){if((result+' '+word).trim().length>46)break;result+=(result?' ':'')+word;}return result||title.slice(0,46);
}
function headlineFor(post,product){
 let title=String(post.creative?.headline||product.title||post.title||'');
 const brand=String(product.attributes?.brand||'').trim();if(brand&&!/^(?:non brand|generic)$/i.test(brand))title=title.replaceAll(brand,'');
 return shortProductTitle(title)||'Product details';
}
function footerDomain(policy,website){try{const value=policy.websiteLabel||website?.url;if(!value)return '';const u=new URL(value.includes('://')?value:'https://'+value);if(!['http:','https:'].includes(u.protocol))return '';return 'www.'+u.hostname.replace(/^www\./,'')+u.pathname.replace(/\/$/,'');}catch{return '';}}
export function productDesignVariant(post,policy={}){
 const index=policy.editorial?.designVariation==='fixed'||!post.id?0:createHash('sha256').update(String(post.id)).digest()[0]%3;
 return ['signature','quiet','editorial'][index];
}
export async function renderProductCreative({post,page,product={},background,sourcePhoto,brandLogo,website,width,height}){
 const analysis=analyzeProduct(product),policy=page.creative_policy||{},variant=productDesignVariant(post,policy),design={...analysis.design,...(variant==='quiet'?{font:'Segoe UI',motif:'quiet',descriptor:''}:variant==='editorial'?{font:['electronics','fan'].includes(analysis.type)?'Bahnschrift':'Georgia',descriptor:''}:{}),...(post.creative?.style==='bold'?{font:'Bahnschrift'}:post.creative?.style==='minimal'?{font:'Segoe UI'}:{})},palette=page.profile_config?.typography_config?.palette||{},paper=palette.background||design.palette[0],tint=palette.background||design.palette[1],ink=palette.text||design.palette[2],accent=palette.primary||design.palette[3],muted='#657676',pad=Math.round(width*.055),scale=width/1080,detailScale=Math.min(scale,height/1080),landscape=width>height,layers=[],visibleText=[],textBounds=[];
 const svg=(body,x=0,y=0,w=width,h=height)=>layers.push({input:Buffer.from(`<svg width="${Math.round(w)}" height="${Math.round(h)}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`),left:Math.round(x),top:Math.round(y)});
 const text=async(value,x,y,w,h,size=32,align='left',color=ink,font=design.font,weight='normal',opacity=1)=>{
  if(!value)return;visibleText.push(String(value));const bytes=await sharp({text:{text:`<span foreground="${color}" weight="${weight}">${escape(value)}</span>`,...fontOptions(page,y<height*.205?'headline':'body',size,font),width:Math.max(1,Math.round(w)),align,wrap:'word-char',rgba:true,spacing:4}}).resize({width:Math.max(1,Math.round(w)),height:Math.max(1,Math.round(h)),fit:'inside',withoutEnlargement:true}).png().toBuffer();
  const m=await sharp(bytes).metadata(),left=Math.round(x+(align==='center'?(w-m.width)/2:align==='right'?w-m.width:0)),top=Math.round(y);let input=bytes;
  if(opacity<1){const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});for(let i=3;i<data.length;i+=4)data[i]=Math.round(data[i]*opacity);input=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();}
  layers.push({input,left,top});textBounds.push({text:String(value),left,top,width:m.width,height:m.height});
 };
 svg(`<defs><radialGradient id="paper" cx="46%" cy="38%" r="80%"><stop stop-color="#ffffff"/><stop offset=".64" stop-color="${paper}"/><stop offset="1" stop-color="${tint}"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#paper)"/>`);
 if(background){layers.push({input:await sharp(background,{limitInputPixels:40000000}).resize(width,height,{fit:'cover'}).png().toBuffer(),left:0,top:0});svg(`<rect width="100%" height="100%" fill="${paper}" opacity=".76"/>`);}
 if(design.motif==='rays'){
  const cx=width*.5,cy=height*.45,r=Math.max(width,height)*1.4;
  for(let i=0;i<12;i++){const a=i*Math.PI/6,b=a+Math.PI/13;svg(`<path d="M${cx} ${cy}L${cx+Math.cos(a)*r} ${cy+Math.sin(a)*r}L${cx+Math.cos(b)*r} ${cy+Math.sin(b)*r}Z" fill="${tint}" opacity=".35"/>`);}
 }else if(design.motif==='arch')svg(`<path d="M${width*.22} ${height*.79}V${height*.38}A${width*.28} ${width*.28} 0 0 1 ${width*.78} ${height*.38}V${height*.79}Z" fill="${tint}" opacity=".46"/><path d="M${width*.18} ${height*.78}V${height*.36}A${width*.32} ${width*.32} 0 0 1 ${width*.82} ${height*.36}V${height*.78}" stroke="${accent}" opacity=".13" fill="none"/>`);
 else if(design.motif==='technical')svg(`<circle cx="${width*.43}" cy="${height*.49}" r="${width*.31}" fill="none" stroke="${accent}" stroke-width="1" opacity=".18"/><circle cx="${width*.43}" cy="${height*.49}" r="${width*.26}" fill="${tint}" opacity=".25"/><path d="M${pad} ${height*.24}H${width-pad}M${pad} ${height*.78}H${width-pad}" stroke="${accent}" opacity=".12"/>`);
 else{
  svg(`<path d="M0 0H${width*.47}L0 ${height*.39}Z" fill="#ffffff" opacity=".7"/><path d="M${width} ${height*.13}V${height*.61}L${width*.56} ${height*.42}Z" fill="${tint}" opacity=".38"/><path d="M0 ${height*.68}L${width*.48} ${height*.34}L${width*.13} ${height*.85}Z" fill="#ffffff" opacity=".38"/>`);
  if(design.motif==='motion'||design.motif==='denim')for(let i=0;i<7;i++)svg(`<path d="M${width*(.69+i*.025)} ${height*.27}L${width*(.52+i*.025)} ${height*.72}" stroke="${accent}" stroke-width="${i%2?1:3}" opacity=".08"/>`);
 }
 if(design.descriptor)await text(design.descriptor,pad,height*.205,width-pad*2,height*.17,Math.min(width*.17,height*.16),'center',ink,'Bahnschrift','bold',.055);
 const logoY=Math.round(height*.025);
 if(brandLogo){const logo=await productLogo(brandLogo,{dark:false,mode:page.brand?.logoDarkAssetId?'original':page.brand?.logoMode||'original',width:Math.min(140,(page.brand?.logoDarkWidth||104)*scale)}),m=await sharp(logo).metadata();layers.push({input:logo,left:Math.round((width-m.width)/2),top:logoY});}
 const title=headlineFor(post,product),titleY=height*(landscape?.115:.108),titleH=height*(landscape?.115:.085),font=/[\u0980-\u09ff]/u.test(title)?'Nirmala UI':design.font;
 if(design.layout==='playful'&&title.split(' ').length>1&&!/[\u0980-\u09ff]/u.test(title)){
  const [lead,...rest]=title.split(' ');await text(lead,pad,titleY,width-pad*2,titleH*.53,48*scale,'center',accent,font,'bold');await text(rest.join(' '),pad,titleY+titleH*.55,width-pad*2,titleH*.45,31*scale,'center',ink,design.secondaryFont,'bold');
 }else await text(title,pad,titleY,width-pad*2,titleH,44*scale,'center',ink,font,design.layout==='editorial'?'normal':'bold');
 const sideRail=design.layout==='technical'&&!landscape&&analysis.callouts.length>0;
 const box={x:width*(sideRail?.07:.11),y:height*(landscape?.28:.215),w:width*(sideRail?.61:.78),h:height*(landscape?.49:.565)};
 let photoMode='no-source',photoQuality,heroBounds;
 if(sourcePhoto){
  const photo=await prepareProductPhoto(sourcePhoto);photoMode=photo.mode;photoQuality=photo.quality;
  const hero=await sharp(photo.bytes).resize(Math.round(box.w),Math.round(box.h),{fit:'inside',withoutEnlargement:false}).png().toBuffer(),m=await sharp(hero).metadata();heroBounds={left:Math.round(box.x+(box.w-m.width)/2),top:Math.round(box.y+(box.h-m.height)/2),width:m.width,height:m.height};
  if(photoMode==='isolated-product')svg(`<defs><radialGradient id="shadow"><stop stop-color="${ink}" stop-opacity=".22"/><stop offset="1" stop-color="${ink}" stop-opacity="0"/></radialGradient></defs><ellipse cx="${heroBounds.left+m.width/2}" cy="${Math.min(height*.79,heroBounds.top+m.height+12*scale)}" rx="${Math.min(m.width*.42,width*.29)}" ry="${16*scale}" fill="url(#shadow)"/>`);
  else svg(`<rect x="${heroBounds.left-8*scale}" y="${heroBounds.top-8*scale}" width="${m.width+16*scale}" height="${m.height+16*scale}" rx="${15*scale}" fill="#ffffff" stroke="${tint}" stroke-width="2"/>`);
  layers.push({input:hero,...{left:heroBounds.left,top:heroBounds.top}});
 }
 const focus=post.seo?.productFocus?.key;const facts=[...analysis.callouts].sort((a,b)=>(a.key===focus?-1:b.key===focus?1:0));
 if(sideRail){
  const x=width*.735,w=width*.215,step=Math.min(height*.135,160*scale),start=height*.32;
  for(const [i,c]of facts.entries()){const y=start+i*step;svg(`<path d="M${x} ${y}H${x+w}" stroke="${accent}" opacity=".28"/>`);await text(c.label,x,y+12*scale,w,26*scale,13*scale,'left',muted,design.secondaryFont,'bold');await text(c.value,x,y+43*scale,w,66*scale,25*scale,'left',ink,design.secondaryFont,'bold');}
 }else if(facts.length){
  const railY=height*.80,w=(width-pad*2)/facts.length;svg(`<path d="M${pad} ${railY-8*detailScale}H${width-pad}" stroke="${accent}" opacity=".22"/>`);
  for(const [i,c]of facts.entries()){const x=pad+i*w;if(i)svg(`<path d="M${x} ${railY+6*detailScale}V${railY+63*detailScale}" stroke="${accent}" opacity=".18"/>`);await text(c.label,x+12*scale,railY+2*detailScale,w-24*scale,22*detailScale,12*detailScale,'center',muted,design.secondaryFont,'bold');await text(c.value,x+12*scale,railY+29*detailScale,w-24*scale,45*detailScale,21*detailScale,'center',ink,design.secondaryFont);}
 }
 const cta=String(post.creative?.cta||'Message us for details').replace(/(?:[$€£৳]|\b(?:BDT|USD|price|discount)\b).*$/iu,'').trim();await text(cta,pad,height*.883,width-pad*2,32*detailScale,18*detailScale,'center',muted,design.secondaryFont);
 const footer=footerDomain(policy,website);
 if(footer){const badgeW=Math.min(width-pad*2,Math.max(300*scale,footer.length*12*scale+75*scale)),x=(width-badgeW)/2,y=height*.922,badgeH=44*detailScale;svg(`<rect width="${badgeW}" height="${badgeH}" rx="${9*detailScale}" fill="${ink}"/><g transform="translate(${badgeW-54*detailScale},0) scale(${detailScale})"><path d="M17 8V29L23 24L29 35L34 32L28 21L37 20Z" fill="${paper}"/></g>`,x,y,badgeW,badgeH);await text(footer,x+14*scale,y+9*detailScale,badgeW-64*scale,badgeH-12*detailScale,18*detailScale,'center',paper,'Segoe UI','bold');}
 const handles=[['fb',policy.facebookHandle],['ig',policy.instagramHandle]].filter(([,h])=>h);
 for(const [type,handle]of handles){const groupW=Math.min((width-pad*2)/2,handle.length*10*scale+37*scale),x=type==='fb'?pad:width-pad-groupW,y=height-30*scale,icon=type==='fb'?`<path d="M14 23V13h3l.5-4H14V7c0-1 .5-2 2-2h2V1h-3c-4 0-5 2-5 6v2H7v4h3v10" fill="${ink}"/>`:`<rect x="2" y="2" width="20" height="20" rx="6" fill="none" stroke="${ink}" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="${ink}" stroke-width="2"/><circle cx="18" cy="6" r="1.5" fill="${ink}"/>`;svg(`<g transform="scale(${scale*.78})">${icon}</g>`,x,y,24*scale,24*scale);await text('@'+handle.replace(/^@/,''),x+25*scale,y,groupW-25*scale,24*scale,15*scale,'left',muted,'Segoe UI');}
 const output=sharp({create:{width,height,channels:4,background:paper}}).composite(layers).jpeg({quality:95,mozjpeg:true});
 if(background)output.withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"><Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType></rdf:Description></rdf:RDF></x:xmpmeta>');
 return {bytes:await output.toBuffer(),width,height,sourcePhotoUsed:!!sourcePhoto,designVariant:variant,designVersion:PRODUCT_DESIGN_VERSION,analysis,visibleText,textBounds,photoMode,photoQuality,heroBounds};
}
