import {createHmac,timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {transaction} from './db.mjs';
import {AppError,uuid} from './errors.mjs';
const signature=(workspace,asset,expires)=>createHmac('sha256',process.env.PLATFORM_ENCRYPTION_KEY||'').update('instagram-image\n'+workspace+'\n'+asset+'\n'+expires).digest('hex');
export function signedMediaURL(workspace,asset,{now=Date.now()}={}){
 if(!uuid(workspace)||!uuid(asset)||!process.env.PLATFORM_ENCRYPTION_KEY)throw new AppError(503,'Media signing is not configured.');
 const expires=String(now+2*3600000),url=new URL('/api/public-media/'+asset,process.env.PLATFORM_ORIGIN);
 url.search=new URLSearchParams({workspace,expires,signature:signature(workspace,asset,expires)}).toString();return url.href;
}
export function validMediaSignature(workspace,asset,expires,actual,{now=Date.now()}={}){
 if(!uuid(workspace)||!uuid(asset)||!/^\d{13}$/.test(expires||'')||+expires<=now||+expires>now+2*3600000||!/^[a-f0-9]{64}$/.test(actual||'')||!process.env.PLATFORM_ENCRYPTION_KEY)return false;
 return timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(signature(workspace,asset,expires),'hex'));
}
export async function publicMedia(url){
 const asset=url.pathname.split('/').at(-1),workspace=url.searchParams.get('workspace'),expires=url.searchParams.get('expires');
 if(!validMediaSignature(workspace,asset,expires,url.searchParams.get('signature')))throw new AppError(404,'Media link expired or is invalid.');
 const row=await transaction(workspace,async db=>(await db.query('SELECT a.path FROM creator.assets a JOIN creator.posts p ON p.workspace_id=a.workspace_id AND p.id=a.post_id WHERE a.workspace_id=$1 AND a.id=$2 AND p.deleted_at IS NULL AND p.archived_at IS NULL',[workspace,asset])).rows[0]);
 if(!row)throw new AppError(404,'Media is unavailable.');
 // Letterbox rather than crop the branded creative. A JPEG square is accepted
 // for Instagram feed photos and preserves every logo, title and footer.
 const bytes=await sharp(await readFile(row.path),{limitInputPixels:40000000}).resize(1080,1080,{fit:'contain',background:'#f0eee6'}).jpeg({quality:92}).toBuffer();
 return new Response(bytes,{headers:{'content-type':'image/jpeg','cache-control':'private, no-store'}});
}
