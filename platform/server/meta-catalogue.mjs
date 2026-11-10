import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {transaction} from './db.mjs';
import {AppError,uuid} from './errors.mjs';
import {publicURL} from './net.mjs';

const columns=['id','title','description','availability','condition','price','link','image_link','brand','product_type'];
const plain=value=>String(value??'').replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim();
// Quote every cell, including multiline values. Prevent spreadsheet formula execution.
const cell=value=>'"'+(/^[=+\-@]/.test(String(value))?'\u0027':'')+String(value).replace(/"/g,'""')+'"';
export function metaCatalogueCSV(products){
 const rows=[],issues=[];
 for(const p of products){
  const id=String(p.external_id||p.id),title=plain(p.title).slice(0,200),description=plain(p.description).slice(0,9999),price=Number(p.price),currency=String(p.currency||'').toUpperCase();
  let validURLs=true;try{publicURL(p.url);publicURL(p.image_url);}catch{validURLs=false;}
  if(!id||!title||!description||!validURLs||!Number.isFinite(price)||price<=0||!/^[A-Z]{3}$/.test(currency)){issues.push({id,reason:'Needs a title, description, public HTTPS product/photo URLs, positive price and three-letter currency.'});continue;}
  rows.push([id,title,description,p.available?'in stock':'out of stock',p.attributes?.condition||'new',price.toFixed(2)+' '+currency,p.url,p.image_url,plain(p.attributes?.brand),plain(p.attributes?.category)]);
 }
 return {csv:'\ufeff'+[columns,...rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n',included:rows.length,excluded:issues.length,issues};
}
const sign=(workspace,page,nonce)=>createHmac('sha256',process.env.PLATFORM_ENCRYPTION_KEY||'').update(['meta-catalogue-v1',workspace,page,nonce].join('\n')).digest('hex');
export function catalogueFeedURL(workspace,page,policy){
 if(!policy?.enabled||!policy.nonce||!process.env.PLATFORM_ENCRYPTION_KEY)return null;
 const url=new URL('/api/catalogue-feed/'+page,process.env.PLATFORM_ORIGIN);url.search=new URLSearchParams({workspace,key:sign(workspace,page,policy.nonce)}).toString();return url.href;
}
export function validCatalogueKey(workspace,page,policy,key){
 if(!uuid(workspace)||!uuid(page)||!policy?.enabled||!policy.nonce||!process.env.PLATFORM_ENCRYPTION_KEY||!/^[a-f0-9]{64}$/.test(key||''))return false;
 return timingSafeEqual(Buffer.from(key,'hex'),Buffer.from(sign(workspace,page,policy.nonce),'hex'));
}
export function newCataloguePolicy(enabled){return {enabled,nonce:randomBytes(24).toString('hex')};}
export async function pageCatalogue(db,workspace,pageId){
 const page=(await db.query('SELECT id,kind,website_id,creative_policy FROM creator.pages WHERE workspace_id=$1 AND id=$2',[workspace,pageId])).rows[0];
 if(!page||page.kind!=='ecommerce'||!page.website_id)throw new AppError(400,'Connect a product website to this ecommerce Page first.');
 const products=(await db.query('SELECT id,external_id,title,description,url,image_url,price,currency,available,attributes,fetched_at FROM creator.products WHERE workspace_id=$1 AND website_id=$2 ORDER BY external_id LIMIT 10001',[workspace,page.website_id])).rows;
 if(products.length>10000)throw new AppError(413,'This catalogue needs a paginated feed adapter before exporting more than 10,000 products.');
 return {page,...metaCatalogueCSV(products),total:products.length,lastImportedAt:products.reduce((latest,p)=>!latest||p.fetched_at>latest?p.fetched_at:latest,null)};
}
export async function publicCatalogueFeed(url){
 const pageId=url.pathname.split('/').at(-1),workspace=url.searchParams.get('workspace'),key=url.searchParams.get('key');
 if(!uuid(pageId)||!uuid(workspace)||!/^[a-f0-9]{64}$/.test(key||''))throw new AppError(404,'Catalogue feed unavailable.');
 return transaction(workspace,async db=>{
  const page=(await db.query('SELECT creative_policy FROM creator.pages WHERE workspace_id=$1 AND id=$2',[workspace,pageId])).rows[0];
  if(!validCatalogueKey(workspace,pageId,page?.creative_policy?.metaCatalogue,key))throw new AppError(404,'Catalogue feed unavailable.');
  const result=await pageCatalogue(db,workspace,pageId);
  if(!result.included)throw new AppError(409,'No valid products are available. Refresh and validate the store catalogue in EchoLink.');
  return new Response(result.csv,{headers:{'content-type':'text/csv; charset=utf-8','cache-control':'private, no-store'}});
 });
}
