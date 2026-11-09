import {createHash} from 'node:crypto';
import {transaction} from './db.mjs';
import {decryptSecret} from './vault.mjs';
import {fetchProducts} from './catalog.mjs';
import {AppError} from './errors.mjs';
export const productFingerprint=product=>createHash('sha256').update(JSON.stringify({title:product.title,description:product.description,image:product.image_url,attributes:product.attributes})).digest('hex');

// Check the store before publication side effects. Catalog reads require no AI.
export async function preflightProduct(w,postId){
 const record=await transaction(w,async db=>{
  const post=(await db.query('SELECT product_id,seo FROM creator.posts WHERE workspace_id=$1 AND id=$2',[w,postId])).rows[0];if(!post?.product_id)return null;
  const product=(await db.query('SELECT * FROM creator.products WHERE workspace_id=$1 AND id=$2',[w,post.product_id])).rows[0];
  const website=(await db.query('SELECT * FROM creator.websites WHERE workspace_id=$1 AND id=$2',[w,product.website_id])).rows[0];
  const connection=website.connection_id?(await db.query('SELECT * FROM creator.connections WHERE workspace_id=$1 AND id=$2',[w,website.connection_id])).rows[0]:null;
  return {post,product,website,connection};
 });
 if(!record)return;
 let {product}=record;
 if(Date.now()-new Date(product.fetched_at)>3600000){
  let products;try{products=await fetchProducts(record.website,record.connection?decryptSecret(record.connection.secret_cipher,w):{},record.connection);}catch{throw new AppError(503,'Store availability could not be verified. Delivery will retry without submitting to Meta.','product_refresh_wait');}
  if(!products.some(p=>p.external_id===product.external_id))throw new AppError(503,'This product was absent from the refreshed catalog batch. Delivery waits for availability verification.','product_refresh_wait');
  await transaction(w,async db=>{for(const p of products)await db.query('UPDATE creator.products SET title=$3,description=$4,url=$5,image_url=$6,price=$7,available=$8,attributes=$9,currency=$11,fetched_at=now() WHERE workspace_id=$1 AND website_id=$2 AND external_id=$10',[w,record.website.id,p.title,p.description,p.url,p.image_url,p.price,p.available,p.attributes,p.external_id,p.currency]);product=(await db.query('SELECT * FROM creator.products WHERE workspace_id=$1 AND id=$2',[w,product.id])).rows[0];});
 }
 if(record.post.seo.priceSnapshot&&(Number(product.price)!==record.post.seo.priceSnapshot.amount||product.currency!==record.post.seo.priceSnapshot.currency))throw new AppError(409,'The catalogue price changed after this caption was generated. Refresh its price and review before publication.','product_changed');
 if(!product.available)throw new AppError(409,'The product is no longer in stock. Update this campaign before publishing.','product_unavailable');
 if(record.post.seo.productFingerprint&&record.post.seo.productFingerprint!==productFingerprint(product))throw new AppError(409,'The product facts or photo changed after generation. Regenerate the draft before publication.','product_changed');
}
