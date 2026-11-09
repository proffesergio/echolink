import {analyzeProduct} from './product-analysis.mjs';
const labels={material:'উপাদান',gsm:'ফ্যাব্রিকের ওজন',fit:'ফিট',battery:'ব্যাটারি',runtime:'ব্যবহারকাল',charging:'চার্জিং',power:'পাওয়ার',capacity:'ধারণক্ষমতা',speed:'গতি',volume:'পরিমাণ',size:'মাপ',connectivity:'সংযোগ'};
export function groundedProductCaption(line,page,product){
 const analysis=analyzeProduct(product),facts=analysis.callouts.slice(0,2).map(f=>(labels[f.key]||f.label)+': '+f.value),brand=String(page.name||'').replace(/[^\p{L}\p{M}\p{N}_]/gu,'');
 // Preserve source values instead of asking a small model to translate technical
 // specifications or English marketing metaphors into Bangla.
 const intro=facts.length?'ছবির পণ্যটির প্রয়োজনীয় তথ্যগুলো দেখে নিন।':'পছন্দের পণ্যটি সম্পর্কে বিস্তারিত জেনে নিন।';
 const english=String(line).replace(/#[\p{L}\p{M}\p{N}_]+/gu,'').trim();
 return [intro,english.toLowerCase().includes(product.title.toLowerCase())?null:product.title,english,facts.join('\n'),'বিস্তারিত জানতে বা অর্ডার করতে ইনবক্সে যোগাযোগ করুন।',[brand?'#'+brand:'','#ProductDetails'].filter(Boolean).join(' ')].filter(Boolean).join('\n\n');
}
const translations={cotton:'কটন',polyester:'পলিয়েস্টার',elastane:'ইলাস্টেন',spandex:'স্প্যানডেক্স',mesh:'মেশ',denim:'ডেনিম','regular fit':'রেগুলার ফিট','slim fit':'স্লিম ফিট','relaxed fit':'রিল্যাক্সড ফিট','oversized fit':'ওভারসাইজড ফিট','athletic fit':'অ্যাথলেটিক ফিট','stainless steel':'স্টেইনলেস স্টিল',silicone:'সিলিকন',aluminium:'অ্যালুমিনিয়াম'};
export function groundedBanglaProductCaption(line,page,product){
 const analysis=analyzeProduct(product),facts=analysis.callouts.slice(0,3).map(f=>{
  let value=f.value;for(const [en,bn]of Object.entries(translations))value=value.replace(new RegExp('\\b'+en+'\\b','gi'),bn);
  return (labels[f.key]||({rpm:'মোটরের গতি',oscillation:'ঘূর্ণন',speeds:'গতির ধাপ',ports:'পোর্ট',dimensions:'আকার'}[f.key])||f.label)+': '+value;
 });
 let opening=String(line||'').replace(/#[\p{L}\p{M}\p{N}_]+/gu,'').split(/(?<=[।!?])\s*/u).filter(s=>!/(?:ইনবক্স|অর্ডার|যোগাযোগ করুন|message us|order now)/iu.test(s)).join(' ').trim();
 // The application owns the exact specifications. A repeated model spec line
 // adds no information and risks misspelling/transliterating model identifiers.
 if(!opening||/[০-৯\d]/u.test(opening))opening=analysis.type==='apparel'?'কাপড় ও ফিটের তথ্য দেখে আপনার পছন্দটি বেছে নিন।':'পণ্যটির প্রয়োজনীয় তথ্যগুলো একনজরে দেখে নিন।';
 const brand=String(page.name||'').replace(/[^\p{L}\p{M}\p{N}_]/gu,'');
 return [product.title,opening,facts.join('\n'),'বিস্তারিত জানতে বা অর্ডার করতে ইনবক্সে যোগাযোগ করুন।',[brand?'#'+brand:'','#পণ্যেরতথ্য'].filter(Boolean).join(' ')].filter(Boolean).join('\n\n');
}
