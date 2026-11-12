import {load} from 'cheerio';
import {createHash} from 'node:crypto';
import Parser from 'rss-parser';
import {outbound,remoteJSON,publicURL} from './net.mjs';
import {AppError} from './errors.mjs';
import {readFabrythingCatalog} from './fabrything.mjs';
import {productDetails} from './content-policy.mjs';
import {extractNewsHTML} from './news-extraction.mjs';
const clean=value=>load('<div>'+String(value||'')+'</div>')('div').text().replace(/\s+/g,' ').trim();
export function canonicalArticleURL(value){const parsed=new URL(value);parsed.hash='';const url=publicURL(parsed.href);for(const key of [...url.searchParams.keys()])if(/^utm_/i.test(key)||['fbclid','gclid'].includes(key))url.searchParams.delete(key);url.searchParams.sort();return url.href;}
export function normalizeProduct(p,website){
 const title=clean(p.title||p.name).slice(0,140);if(!title)throw new AppError(400,'The product must have a title.');
 const url=publicURL(p.url||p.permalink||(p.slug?new URL('/product/'+p.slug,website.url).href:website.url)).href,image=p.image_url||p.thumbnail||p.image?.url||p.image?.src||(Array.isArray(p.image)?p.image[0]:typeof p.image==='string'?p.image:null)||p.images?.[0]?.src||p.images?.[0]?.url||(typeof p.images?.[0]==='string'?p.images[0]:null);
 const raw=p.price??p.initial_selling_price??p.offers?.price,basePrice=raw===undefined||raw===null||raw===''?null:Number(raw),price=p.discount_price>0&&p.discount_price<basePrice?Number(p.discount_price):basePrice;
 if(price!==null&&(!Number.isFinite(price)||price<0))throw new AppError(400,'A product price is invalid.');
 const compare=Number(p.compare_at_price||(price<basePrice?basePrice:0));
 return {external_id:String(p.id||p.sku||createHash('sha256').update(url).digest('hex')),title,description:clean(p.description||p.body_html).slice(0,12000),url,image_url:image?publicURL(new URL(image,website.url).href).href:null,price,compare_at_price:compare>price?compare:null,currency:String(p.currency||p.offers?.priceCurrency||(new URL(website.url).hostname.endsWith('fabrything.com')?'BDT':'')).slice(0,5),available:p.total_stock!==undefined?Number(p.total_stock)>0:p.available!==false&&p.stock_status!=='outofstock'&&p.stock!==0&&p.stock_quantity!==0,attributes:productDetails(p,clean)};
}
export function parseProductHTML(html,website){
 const $=load(html),found=[];function walk(value){if(Array.isArray(value)){value.forEach(walk);return;}if(!value||typeof value!=='object')return;if([value['@type']].flat().includes('Product')){const offer=[value.offers].flat()[0]||{};found.push(normalizeProduct({...value,image_url:[value.image].flat().map(x=>typeof x==='string'?x:x?.url).find(Boolean),price:offer.price,currency:offer.priceCurrency,available:!String(offer.availability||'').includes('OutOfStock')},website));}if(value['@graph'])walk(value['@graph']);}
 $('script[type="application/ld+json"]').each((_,el)=>{try{walk(JSON.parse($(el).text()));}catch(error){if(error instanceof AppError)throw error;}});
 return found.slice(0,100);
}
export async function fetchProducts(website,secret={},connection,options={}){
 const base=publicURL(website.url);let products;
 if(website.connector==='fabrything_db')products=await readFabrythingCatalog(connection,secret,website,options);
 else if(website.connector==='shopify'){
  const version=website.config.apiVersion||'2026-10';const data=await remoteJSON(base.origin+'/api/'+version+'/graphql.json',{method:'POST',headers:{'content-type':'application/json','X-Shopify-Storefront-Access-Token':secret.apiKey||secret.token||''},body:{query:'{ shop { paymentSettings { currencyCode } } products(first: 100) { nodes { id title description productType vendor onlineStoreUrl availableForSale featuredImage { url } variants(first: 1) { nodes { price { amount currencyCode } compareAtPrice { amount } } } } } }'}});
  if(data.errors?.length)throw new AppError(502,'Shopify rejected the catalog query. Check the Storefront token and permissions.');
  products=(data.data?.products?.nodes||[]).map(p=>({...p,url:p.onlineStoreUrl||base.href,image_url:p.featuredImage?.url,price:p.variants.nodes[0]?.price.amount,compare_at_price:p.variants.nodes[0]?.compareAtPrice?.amount,currency:p.variants.nodes[0]?.price.currencyCode,available:p.availableForSale}));
 }else if(website.connector==='woocommerce'){
  const url=new URL('/wp-json/wc/v3/products',base);url.searchParams.set('per_page','100');
  products=await remoteJSON(url.href,{headers:{authorization:'Basic '+Buffer.from((secret.username||'')+':'+(secret.password||'')).toString('base64')}});
 }else if(website.connector==='json_catalog'){
  const data=await remoteJSON(website.config.catalogURL||base.href);products=Array.isArray(data)?data:data.products||data.results||(Array.isArray(data.data)?data.data:data.data?.data||data.data?.results);
 }else if(website.connector==='public_product'){
  const response=await outbound(base.href);if(!response.ok)throw new AppError(502,'The product page could not be read.');return parseProductHTML(response.bytes.toString(),website);
 }else throw new AppError(400,'Choose a product source connector for this website.');
 if(!Array.isArray(products))throw new AppError(400,'Expected a product array or {products: [...]}.');
 const normalized=products.map(p=>normalizeProduct(p,website)),excluded=new Set(options.excludeIds||[]);
 return normalized.filter(p=>(!options.externalId||p.external_id===String(options.externalId))&&!excluded.has(p.external_id)).slice(0,100);
}
export async function readFeed(feed){
 let response;try{response=await outbound(feed.url);if(!response.ok)throw new Error('feed');}catch(error){if(!feed.fallback_url)throw error;response=await outbound(feed.fallback_url);if(!response.ok)throw new AppError(502,'Both feed URLs failed.');}
 const parsed=await new Parser({customFields:{item:[['media:content','mediaContent'],['media:thumbnail','mediaThumbnail']]}}).parseString(response.bytes.toString());
 return (parsed.items||[]).slice(0,40).filter(x=>x.link).flatMap(item=>{try{return[{title:clean(item.title).slice(0,140),url:canonicalArticleURL(item.link),body:clean(item['content:encoded']||item.content||item.contentSnippet).slice(0,16000),date:item.isoDate||item.pubDate,category:item.categories?.join(' ')||'',image:item.mediaContent?.$?.url||item.mediaThumbnail?.$?.url||(/image/i.test(item.enclosure?.type||'')?item.enclosure.url:null)||load(item['content:encoded']||item.content||'')('img').first().attr('src')||null}];}catch{return[];}}).sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
}
export async function articleDetails(article,{timeout=30000}={}){
 const response=await outbound(article.url,{timeout});if(!response.ok)return article;const report=extractNewsHTML(response.bytes.toString());
 return {...article,category:report.category||article.category,body:(report.body||article.body||'').slice(0,30000),extraction:report.extraction,publishedAt:report.publishedAt||article.date,image:report.image?publicURL(new URL(report.image,article.url).href).href:article.image};
}
