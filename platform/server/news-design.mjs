import sharp from 'sharp';
import {categoryLabel} from './content-policy.mjs';
const escape=s=>String(s||'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export async function renderNewsCreative({post,page,photo,brandLogo,website,width,height}){
 const layers=[],pad=Math.round(width*.055),accent=page.brand?.color||'#f17859',landscape=width>height,photoH=Math.round(height*(landscape?.58:.57)),headlineY=photoH+36,headlineH=height-headlineY-128;
 const svg=(body,w=width,h=height,left=0,top=0)=>layers.push({input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`),left,top});
 svg('<rect width="100%" height="100%" fill="#101d26"/>');
 if(photo)layers.push({input:await sharp(photo,{limitInputPixels:40000000}).rotate().resize(width,photoH,{fit:'cover'}).png().toBuffer(),left:0,top:0});
 svg(`<defs><linearGradient id="shade" x2="0" y2="1"><stop stop-color="#08151d" stop-opacity=".6"/><stop offset=".35" stop-color="#08151d" stop-opacity="0"/><stop offset="1" stop-color="#101d26" stop-opacity="1"/></linearGradient></defs><rect width="${width}" height="${photoH}" fill="url(#shade)"/>`);
 if(brandLogo){const logo=await sharp(brandLogo).trim().resize(105,70,{fit:'inside'}).png().toBuffer(),m=await sharp(logo).metadata();layers.push({input:logo,left:pad,top:25});}else{const logo=await sharp({text:{text:`<span foreground="#ffffff" weight="bold">${escape(page.name)}</span>`,font:'Segoe UI 28',rgba:true}}).png().toBuffer();layers.push({input:logo,left:pad,top:30});}
 const category=categoryLabel(post.seo?.category||'general',page.language),cat=await sharp({text:{text:`<span foreground="#ffffff" weight="bold">${escape(category)}</span>`,font:'Nirmala UI 25',rgba:true}}).png().toBuffer(),cm=await sharp(cat).metadata(),cw=Math.max(130,cm.width+32);svg(`<rect width="${cw}" height="49" rx="7" fill="${accent}"/>`,cw,49,width-pad-cw,31);layers.push({input:cat,left:width-pad-cw+Math.round((cw-cm.width)/2),top:39});
 svg(`<rect width="52" height="5" fill="${accent}"/>`,52,5,pad,headlineY-13);
 const title=post.creative.headline||post.title,heading=await sharp({text:{text:`<span foreground="#fff8ed" weight="bold">${escape(title)}</span>`,font:'Nirmala UI '+(landscape?43:58),width:width-pad*2,rgba:true,spacing:12,wrap:'word-char'}}).resize({width:width-pad*2,height:Math.max(90,headlineH),fit:'inside',withoutEnlargement:true}).png().toBuffer();layers.push({input:heading,left:pad,top:headlineY});
 let domain=page.creative_policy?.websiteLabel||website?.url||'';try{const u=new URL(domain.includes('://')?domain:'https://'+domain);domain=u.hostname.replace(/^www\./,'');if(domain==='fabrything.com'&&u.pathname.startsWith('/nobleseek'))domain='nobleseek.fabrything.com';}catch{domain='';}
 svg(`<path d="M${pad} 1H${width-pad}" stroke="#fff" opacity=".16"/>`,width,2,0,height-83);
 if(domain){const footer=await sharp({text:{text:`<span foreground="#c6d1d3">${escape(domain)}</span>`,font:'Segoe UI 23',width:width-pad*2,align:'center',rgba:true}}).png().toBuffer(),m=await sharp(footer).metadata();layers.push({input:footer,left:Math.round((width-m.width)/2),top:height-62});}
 svg(`<rect width="${width}" height="7" fill="${accent}"/>`,width,7,0,height-7);
 return {bytes:await sharp({create:{width,height,channels:3,background:'#101d26'}}).composite(layers).jpeg({quality:94}).toBuffer(),width,height,sourcePhotoUsed:!!photo,designVersion:'studio-v5',visibleText:[category,title,domain]};
}
