import {withNobleDatabase} from './nobleseek.mjs';
// Owner-only, read-only catalog access to the already approved website database.
export async function readFabrythingCatalog(connection,secret,website){
 return withNobleDatabase(connection,secret,async(db,{schema})=>{
  await db.query('BEGIN READ ONLY');
  const products=(await db.query(`SELECT p.id,p.name,p.slug,p.image,p.description,p.initial_selling_price,p.discount_price,p.sku,p.status,COALESCE((SELECT sum(v.stock_quantity) FROM "${schema}".catalog_productvariant v WHERE v.product_id=p.id AND v.is_active),0) AS stock FROM "${schema}".catalog_products p WHERE p.status='ACTIVE' ORDER BY p.updated_at DESC LIMIT 100`)).rows;
  await db.query('ROLLBACK');const base=new URL(website.url);
  return products.map(p=>({id:p.id,title:p.name,description:p.description,url:new URL('/product/'+p.slug,base).href,image_url:p.image?.[0]?new URL(typeof p.image[0]==='string'?p.image[0]:p.image[0].url,base).href:null,price:p.discount_price>0&&p.discount_price<p.initial_selling_price?p.discount_price:p.initial_selling_price,compare_at_price:p.initial_selling_price,currency:'BDT',available:Number(p.stock)>0,sku:p.sku}));
 });
}
