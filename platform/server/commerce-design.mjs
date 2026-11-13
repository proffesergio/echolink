import {createHash} from 'node:crypto';
import {HEADLINE_PRESETS} from '../shared/commerce-design.mjs';
export {HEADLINE_PRESETS,relativeLuminance,contrastRatio,safeInk,commerceBackground,pointerMarkup} from '../shared/commerce-design.mjs';
const bound=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.min(max,Math.max(min,Number(value))):fallback;
const color=(value,fallback)=>/^#[a-f0-9]{6}$/i.test(value||'')?value:fallback;
export function commerceStyle(post,policy={}){
 const config=policy.commerceDesign||{},digest=createHash('sha256').update([post.id||post.title||'',config.seed||'0'].join(':')).digest();
 const modes=['gradient','texture','geometry','palette'],mode=modes.includes(config.background)?config.background:config.background==='mixed'?modes[digest[0]%4]:'original';
 return {background:mode,seed:config.seed||'0',angle:35+digest[1]%90,offset:digest[2]%40,preset:HEADLINE_PRESETS[config.headline]?config.headline:'original',pointer:{enabled:config.pointer?.enabled===true,shape:config.pointer?.shape==='hand'?'hand':'arrow',target:config.pointer?.target==='product'?'product':'cta',size:bound(config.pointer?.size,.6,1.6,1),rotation:bound(config.pointer?.rotation,-60,60,-12),color:color(config.pointer?.color,'#172d33')}};
}
