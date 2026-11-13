export const HEADLINE_PRESETS=Object.freeze({original:{weight:'bold',tracking:0},editorial:{weight:'normal',tracking:0,font:'Georgia'},wide:{weight:'bold',tracking:1600,font:'Segoe UI'},highlight:{weight:'bold',tracking:0},stacked:{weight:'bold',tracking:0}});
const bound=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.min(max,Math.max(min,Number(value))):fallback;
export function relativeLuminance(hex){const c=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];}
export function contrastRatio(a,b){const values=[relativeLuminance(a),relativeLuminance(b)].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05);}
export function safeInk(background,preferred){return contrastRatio(background,preferred)>=4.5?preferred:contrastRatio(background,'#10252b')>=4.5?'#10252b':'#ffffff';}
export function commerceBackground(style,{width,height,paper,tint,accent}){
 const base=`<defs><linearGradient id="variation" gradientTransform="rotate(${style.angle} .5 .5)"><stop stop-color="#ffffff"/><stop offset="1" stop-color="${tint}"/></linearGradient><pattern id="grain" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r=".65" fill="${accent}" opacity=".08"/></pattern></defs>`;
 if(style.background==='original')return '';
 if(style.background==='texture')return base+`<rect width="100%" height="100%" fill="url(#grain)"/>`;
 if(style.background==='geometry')return `<circle cx="${width*.85}" cy="${height*.47}" r="${width*.32}" fill="${tint}" opacity=".35"/><path d="M0 ${height*.28}L${width*.3} 0H0Z" fill="${accent}" opacity=".045"/>`;
 if(style.background==='palette')return `<rect width="100%" height="100%" fill="${paper}"/><rect width="100%" height="100%" fill="${accent}" opacity=".035"/>`;
 return base+'<rect width="100%" height="100%" fill="url(#variation)" opacity=".6"/>';
}
export function pointerMarkup({shape='arrow',color='#172d33',rotation=0}={}){
 const fill=/^#[a-f0-9]{6}$/i.test(color)?color:'#172d33';
 const path=shape==='hand'?'M22 42V13a5 5 0 0 1 10 0v20-8a5 5 0 0 1 10 0v10-4a5 5 0 0 1 10 0v10-2a5 5 0 0 1 10 0v16c0 17-10 25-24 25-9 0-14-7-19-14L8 50a5 5 0 0 1 8-6l6 8Z':'M17 8V64l15-15 13 28 12-6-13-27 21-2Z';
 return `<g transform="translate(42 44) rotate(${bound(rotation,-60,60,0)}) translate(-42 -44)"><path d="${path}" fill="${fill}" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"/></g>`;
}
