import {fontOptions} from './fonts.mjs';
import sharp from 'sharp';
import {categoryLabel} from './content-policy.mjs';
const escape=s=>String(s||'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function newsHeadline(post){
 const title=(post.creative?.headline||post.title||'').trim(),words=title.split(/\s+/),requested=post.creative?.highlight?.trim();
 const highlight=requested&&title.includes(requested)?requested:words.slice(0,Math.max(1,Math.ceil(words.length*.4))).join(' '),color=/^#[a-f0-9]{6}$/i.test(post.creative?.highlightColor||'')?post.creative.highlightColor:'#ffe45a',at=title.indexOf(highlight);
 return {title,highlight,color,markup:escape(title.slice(0,at))+`<span foreground="${color}">${escape(highlight)}</span>`+escape(title.slice(at+highlight.length))};
}
export async function renderNewsCreative({post,page,photo,brandLogo,website,width,height}){
 const layers=[],pad=Math.round(width*.06),landscape=width>height,photoY=Math.round(height*(landscape?.40:.44)),photoH=height-photoY,headline=newsHeadline(post),accent='#173e43';
 const svg=(body,w=width,h=height,left=0,top=0)=>layers.push({input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`),left,top});
 svg('<rect width="100%" height="100%" fill="#080b0d"/>');
 if(photo)layers.push({input:await sharp(photo,{limitInputPixels:40000000}).rotate().resize(width,photoH,{fit:'cover'}).png().toBuffer(),left:0,top:photoY});
 svg(`<defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#080b0d"/><stop offset=".32" stop-color="#080b0d" stop-opacity=".15"/><stop offset=".68" stop-color="#080b0d" stop-opacity="0"/><stop offset="1" stop-color="#080b0d" stop-opacity=".78"/></linearGradient></defs><rect width="${width}" height="${photoH}" fill="url(#shade)"/>`,width,photoH,0,photoY);
 if(brandLogo){const size=Math.round(width*.12),logo=await sharp(brandLogo).trim().resize(size,size,{fit:'inside'}).png().toBuffer();layers.push({input:logo,left:pad,top:Math.round(height*.025)});}
 else{const logo=await sharp({text:{text:`<span foreground="#ffffff" weight="bold">${escape(page.name)}</span>`,...fontOptions(page,'body',27,'Segoe UI'),width:Math.round(width*.4),rgba:true}}).png().toBuffer();layers.push({input:logo,left:pad,top:30});}
 const category=categoryLabel(post.seo?.category||'general',page.language),stamp=new Intl.DateTimeFormat(page.language==='English'?'en-GB':'bn-BD',{timeZone:page.timezone||'Asia/Dhaka',day:'numeric',month:'long',year:'numeric'}).format(new Date(post.created_at||Date.now()));
 const meta=await sharp({text:{text:`<span foreground="#bfc8cd">${escape(stamp)}\n${escape(category)}</span>`,...fontOptions(page,'body',22),width:Math.round(width*.55),align:'right',spacing:10,rgba:true}}).png().toBuffer(),mm=await sharp(meta).metadata();layers.push({input:meta,left:width-pad-mm.width,top:Math.round(height*.04)});
 const headingY=Math.round(height*(landscape?.20:.18)),maxH=Math.round(height*(landscape?.32:.30)),heading=await sharp({text:{text:`<span foreground="#ffffff" weight="bold">${headline.markup}</span>`,...fontOptions(page,'headline',landscape?48:64),width:width-pad*2,rgba:true,align:'center',spacing:12,wrap:'word-char'}}).resize({width:width-pad*2,height:maxH,fit:'inside',withoutEnlargement:true}).png().toBuffer(),hm=await sharp(heading).metadata();layers.push({input:heading,left:Math.round((width-hm.width)/2),top:headingY});
 let domain=page.creative_policy?.websiteLabel||website?.url||'';try{const u=new URL(domain.includes('://')?domain:'https://'+domain);domain=u.hostname.replace(/^www\./,'');if(domain==='fabrything.com'&&u.pathname.startsWith('/nobleseek'))domain='nobleseek.fabrything.com';}catch{domain='';}
 const pillText=category;
 const pill=await sharp({text:{text:`<span foreground="#172b31" weight="bold">${escape(pillText)}</span>`,...fontOptions(page,'body',24),rgba:true}}).png().toBuffer(),pm=await sharp(pill).metadata(),pw=pm.width+42,ph=pm.height+22,py=height-115-ph;svg(`<rect width="${pw}" height="${ph}" rx="${ph/2}" fill="#ffffff"/>`,pw,ph,Math.round((width-pw)/2),py);layers.push({input:pill,left:Math.round((width-pm.width)/2),top:py+11});
 svg(`<rect width="${width}" height="64" fill="${accent}"/>`,width,64,0,height-64);
 if(domain){const footer=await sharp({text:{text:`<span foreground="#ffffff">${escape(domain)}</span>`,...fontOptions(page,'body',24,'Segoe UI'),width:width-pad*2,align:'center',rgba:true}}).png().toBuffer(),m=await sharp(footer).metadata();layers.push({input:footer,left:Math.round((width-m.width)/2),top:height-48});}
 const credit=String(page.creative_policy?.editorial?.imageCredit||'').trim();if(photo&&credit){const label=await sharp({text:{text:`<span foreground="#dddddd">${escape(credit)}</span>`,...fontOptions(page,'body',15),width:width-pad*2,align:'right',rgba:true}}).png().toBuffer(),cm=await sharp(label).metadata();layers.push({input:label,left:width-pad-cm.width,top:height-85-cm.height});}
 return {bytes:await sharp({create:{width,height,channels:3,background:'#080b0d'}}).composite(layers).jpeg({quality:94}).toBuffer(),width,height,sourcePhotoUsed:!!photo,designVersion:'studio-v6',headlineHighlight:headline.highlight,highlightColor:headline.color,visibleText:[category,headline.title,domain]};
}
