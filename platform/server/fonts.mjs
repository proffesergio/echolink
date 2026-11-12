import * as fontkit from 'fontkit';
import sharp from 'sharp';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {AppError} from './errors.mjs';
import {transaction,workspaceLock} from './db.mjs';

export const FONT_MAX_BYTES=2*1024*1024;
export const fontMimes=['font/ttf','font/otf','font/woff','font/woff2'];
const metadata=new Map();
const bundledBangla=fileURLToPath(new URL('../assets/fonts/NotoSansBengali.ttf',import.meta.url));
export function inspectFont(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<12||bytes.length>FONT_MAX_BYTES)throw new AppError(400,'Choose a TTF, OTF, WOFF or WOFF2 font under 2 MB.');
 const signature=bytes.readUInt32BE(0),formats={65536:['font/ttf','ttf'],1330926671:['font/otf','otf'],2001684038:['font/woff','woff'],2001684018:['font/woff2','woff2']};
 if(!formats[signature])throw new AppError(400,'Upload a real TTF, OTF, WOFF or WOFF2 font, not a renamed file or collection.');
 try{
  if([2001684038,2001684018].includes(signature)&&(bytes.length<48||bytes.readUInt32BE(8)!==bytes.length||bytes.readUInt32BE(16)>8*1024*1024))throw Error('Invalid compressed font size');
  const font=fontkit.create(bytes);
  if(Object.values(font.directory.tables).reduce((n,t)=>n+(t.length||0),0)>8*1024*1024)throw Error('Expanded font is too large');
  const family=String(font.familyName||'').trim();
  if(!family||family.length>120||/[\x00-\x1f<>"\\]/.test(family)||!font.numGlyphs||font.numGlyphs>65535)throw new Error('Invalid font metadata');
  const supportsBangla=[...'বাংলা সংবাদ'].filter(c=>c!==' ').every(c=>font.hasGlyphForCodePoint(c.codePointAt(0)));
  return {family,supportsBangla,mime:formats[signature][0],extension:formats[signature][1]};
 }catch{throw new AppError(400,'This font could not be decoded. Choose a valid Unicode TTF, OTF, WOFF or WOFF2 font.');}
}
async function describe(asset){
 let data=metadata.get(asset.id);if(!data){data=inspectFont(await readFile(asset.path));metadata.set(asset.id,data);if(metadata.size>100)metadata.delete(metadata.keys().next().value);}
 return {id:asset.id,family:data.family,supportsBangla:data.supportsBangla,mime:data.mime};
}
export const listFonts=w=>transaction(w,async db=>Promise.all((await db.query("SELECT id,path,mime FROM creator.assets WHERE workspace_id=$1 AND mime=ANY($2::text[]) ORDER BY created_at DESC LIMIT 20",[w,fontMimes])).rows.map(describe)));
export async function uploadFont(w,body){
 if(body.licensed!==true)throw new AppError(400,'Confirm permission to use the font in your designs.');
 if(typeof body.dataURL!=='string'||body.dataURL.length>FONT_MAX_BYTES*1.4+100||!/^data:[a-zA-Z0-9.+/-]*;base64,[A-Za-z0-9+/=]+$/.test(body.dataURL))throw new AppError(400,'Choose a TTF, OTF, WOFF or WOFF2 font file under 2 MB.');
 const bytes=Buffer.from(body.dataURL.split(',')[1],'base64'),info=inspectFont(bytes),id=randomUUID(),dir=new URL('../.local/assets/'+w+'/',import.meta.url),path=fileURLToPath(new URL(id+'.'+info.extension,dir));
 await mkdir(dir,{recursive:true});
 try{return await transaction(w,async db=>{
  await workspaceLock(db,w);if((await db.query('SELECT count(*)::int AS count FROM creator.assets WHERE workspace_id=$1 AND mime=ANY($2::text[])',[w,fontMimes])).rows[0].count>=20)throw new AppError(409,'This workspace already has 20 fonts. Reuse an existing font.');
  await writeFile(path,bytes,{flag:'wx'});
  // Decode and shape a small sample before accepting the font for production.
  await sharp({text:{text:info.supportsBangla?'বাংলা সংবাদ':'Content design',font:info.family+' 28',fontfile:path,width:500,rgba:true}}).png().toBuffer();
  await db.query('INSERT INTO creator.assets(id,workspace_id,path,mime) VALUES($1,$2,$3,$4)',[id,w,path,info.mime]);metadata.set(id,info);return {id,family:info.family,supportsBangla:info.supportsBangla,mime:info.mime};
 });}catch(error){await unlink(path).catch(()=>{});if(error instanceof AppError)throw error;throw new AppError(400,'The font could not be rendered. Try a different Unicode font.');}
}
export async function resolvePageFonts(page){
 const result={};
 for(const [role,key] of [['headline','headlineFontAssetId'],['body','bodyFontAssetId']]){
  const id=page.brand?.[key];if(!id)continue;
  const asset=await transaction(page.workspace_id,async db=>(await db.query('SELECT id,path,mime FROM creator.assets WHERE workspace_id=$1 AND id=$2',[page.workspace_id,id])).rows[0]);
  if(!asset||!fontMimes.includes(asset.mime))throw new AppError(409,'A selected design font is unavailable. Update this Page’s font settings.');
  const info=await describe(asset);result[role]={...info,path:asset.path};
 }
 return result;
}
export function fontOptions(page,role,size,fallback='Nirmala UI'){
 const selected=page.designFonts?.[role]||(!page.designFonts?.[role]&&fallback==='Nirmala UI'?{family:'Noto Sans Bengali',path:bundledBangla}:null);return {font:(selected?.family||fallback)+' '+Math.round(size),...(selected?{fontfile:selected.path}:{})};
}
