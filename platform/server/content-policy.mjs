export const newsCategories=[
 {id:'bangladesh',en:'Bangladesh',bn:'বাংলাদেশ',pattern:/bangladesh|national|বাংলাদেশ|ঢাকা|জেলা|রাজধানী/iu},
 {id:'world',en:'World',bn:'আন্তর্জাতিক',pattern:/world|international|আন্তর্জাতিক|বিদেশ|যুক্তরাষ্ট্র|ইসরায়েল|ইরান/iu},
 {id:'politics',en:'Politics',bn:'রাজনীতি',pattern:/politics|রাজনীতি|নির্বাচন|বিএনপি|সংসদ/iu},
 {id:'business',en:'Business',bn:'অর্থনীতি',pattern:/business|economy|অর্থনীতি|বাণিজ্য|শেয়ার|ব্যাংক|স্বর্ণ/iu},
 {id:'sports',en:'Sports',bn:'খেলা',pattern:/sports|cricket|football|খেলা|ক্রিকেট|ফুটবল|ম্যাচ|উইকেট|বোলার|ব্যাটসম্যান/iu},
 {id:'technology',en:'Technology',bn:'প্রযুক্তি',pattern:/technology|tech\b|প্রযুক্তি|স্মার্টফোন|কৃত্রিম বুদ্ধিমত্তা/iu},
 {id:'education',en:'Education',bn:'শিক্ষা',pattern:/education|শিক্ষা|পরীক্ষা|বিশ্ববিদ্যালয়|এইচএসসি|এসএসসি/iu},
 {id:'health',en:'Health',bn:'স্বাস্থ্য',pattern:/health|স্বাস্থ্য|চিকিৎসা|হাসপাতাল|ডেঙ্গু/iu},
 {id:'entertainment',en:'Entertainment',bn:'বিনোদন',pattern:/entertainment|বিনোদন|চলচ্চিত্র|সিনেমা|অভিনেত/iu},
 {id:'lifestyle',en:'Lifestyle',bn:'জীবনযাপন',pattern:/lifestyle|জীবনযাপন|লাইফস্টাইল|ফ্যাশন|রান্না/iu},
 {id:'environment',en:'Environment',bn:'পরিবেশ',pattern:/environment|পরিবেশ|জলবায়ু|ঘূর্ণিঝড়|বন্যা/iu},
 {id:'general',en:'Latest',bn:'সর্বশেষ',pattern:/$a/}
];
export function categoryFor(article){
 const section=String(article.category||'');
 return newsCategories.find(c=>c.pattern.test(section))?.id||newsCategories.find(c=>c.pattern.test(String(article.url||article.source_url||'').split('?')[0]))?.id||newsCategories.find(c=>c.pattern.test(article.title||''))?.id||'general';
}
export const categoryLabel=(id,language='Bangla')=>{const c=newsCategories.find(c=>c.id===id)||newsCategories.at(-1);return language==='English'?c.en:c.bn;};
export function balancedArticles(candidates,recent=[],allowed=[]){
 const counts=new Map();for(const c of recent)counts.set(c,(counts.get(c)||0)+1);
 return candidates.map((a,i)=>({...a,category:categoryFor(a),_order:i})).filter(a=>!allowed.length||allowed.includes(a.category)).sort((a,b)=>(counts.get(a.category)||0)-(counts.get(b.category)||0)||Number(!!b.image)-Number(!!a.image)||a._order-b._order);
}
export function pickCatalogProduct(products,recent=[],random=Math.random){
 if(!products.length)return null;
 const groups=new Map();for(const p of products){const category=p.attributes?.category||'Uncategorized';if(!groups.has(category))groups.set(category,[]);groups.get(category).push(p);}
 const last=recent[0],categories=[...groups.keys()],rotating=categories.length>1?categories.filter(c=>c!==last):categories;
 const category=rotating[Math.min(rotating.length-1,Math.floor(random()*rotating.length))],items=groups.get(category);
 return items[Math.min(items.length-1,Math.floor(random()*items.length))];
}
export function productDetails(raw,clean=s=>String(s||'').trim()){
 const value=x=>typeof x==='object'&&x!==null?x.name||x.title||x.label||'':x;
 const category=clean(value(raw.category_name||raw.category||raw.productType||raw.product_type||raw.categories?.[0])||'Uncategorized').slice(0,120);
 const brand=clean(value(raw.brand||raw.vendor||raw.brands?.[0])).slice(0,100),material=clean(value(raw.material)).slice(0,150);
 const specifications={};for(const [key,v]of Object.entries(raw.specifications||raw.specs||{}).slice(0,30)){if(typeof v==='string'||typeof v==='number')specifications[clean(key).slice(0,50)]=clean(String(v)).slice(0,150);}for(const a of Array.isArray(raw.attributes)?raw.attributes:[]){if(a?.name&&Array.isArray(a.options))specifications[clean(a.name).toLowerCase()]=a.options.map(clean).join(', ').slice(0,150);}
 return {sku:raw.sku||null,category,brand,material,specifications,color:clean(value(raw.color)).slice(0,100)};
}
