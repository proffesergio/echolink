// Public, fictional fixtures. Never import production state or provider settings here.
export const DEMO_LOGIN={email:'demo@echolink.example',password:'ExploreEchoLink!'};
export const DEMO_KEY='echolink.public-demo.v1';
export const demoPages=[
 {id:'forma',name:'Forma Supply',kind:'ecommerce',niche:'Everyday essentials',color:'#f1846d'},
 {id:'daily',name:'The Daily Edit',kind:'news',niche:'Community & culture',color:'#93bca6'},
 {id:'studio',name:'Studio Notes',kind:'creator',niche:'Ideas & inspiration',color:'#b4a2d5'},
];
export const demoProducts=[
 {id:'tee',name:'The everyday cotton tee',category:'Clothing',facts:['Cotton fabric','Relaxed silhouette'],short:'Everyday, elevated.'},
 {id:'lamp',name:'Arc desk light',category:'Home & workspace',facts:['Adjustable arm','Warm and cool light settings'],short:'A brighter kind of work.'},
 {id:'bottle',name:'Daily carry bottle',category:'Accessories',facts:['Stainless steel body','Reusable design'],short:'Take a little better with you.'},
];
const statuses=new Set(['draft','scheduled','published']);
const pageIds=new Set(demoPages.map(p=>p.id));
const clean=(text,max)=>String(text??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').slice(0,max);
export function createDemoState(now=new Date()){
 const day=new Date(now);day.setDate(day.getDate()+1);day.setHours(10,0,0,0);
 return {version:1,posts:[
  {id:'sample-forma',pageId:'forma',title:'Everyday, elevated.',brief:'The everyday cotton tee',productId:'tee',language:'English',style:'paper',status:'draft',facebook:'A considered fit for everyday plans. Meet our cotton tee with a relaxed silhouette. Which colour would you style it with?\n\n#EverydayStyle #FormaSupply',instagram:'Easy shape. Everyday favourite.\nThe cotton tee, rethought for your routine.\n\n#EverydayStyle #CottonTee #FormaSupply',scheduledAt:null},
  {id:'sample-daily',pageId:'daily',title:'More room for a good story.',brief:'A neighbourhood reading club',productId:'tee',language:'English',style:'ink',status:'scheduled',facebook:'SAMPLE STORY · A neighbourhood reading club brings people together around a shared love of books. What would your first pick be?\n\n#Community #Reading',instagram:'SAMPLE STORY · Good books. Better conversations.\nWhat are you reading this week?\n\n#CommunityStories #BookClub',scheduledAt:day.toISOString()},
  {id:'sample-studio',pageId:'studio',title:'Make space for your next idea.',brief:'A small creative habit',productId:'tee',language:'English',style:'lilac',status:'draft',facebook:'Give one small idea your full attention today. Write it down, try it out, and see where it takes you.\n\n#CreativePractice #StudioNotes',instagram:'One small idea. A little room to grow.\nSave this for your next creative reset.\n\n#CreativePractice #SmallSteps',scheduledAt:null},
 ],events:[{id:'welcome',text:'Sample workspace ready. Your changes stay in this browser tab.',at:now.toISOString()}],connections:{}};
}
export function readDemoState(raw,now=new Date()){
 try{
  const state=JSON.parse(raw);if(state?.version!==1||!Array.isArray(state.posts)||!Array.isArray(state.events))return createDemoState(now);
  const posts=state.posts.slice(0,50).filter(p=>p&&pageIds.has(p.pageId)&&statuses.has(p.status)&&typeof p.id==='string').map(p=>({
   id:clean(p.id,100),pageId:p.pageId,title:clean(p.title,100),brief:clean(p.brief,500),
   productId:demoProducts.some(x=>x.id===p.productId)?p.productId:'tee',
   language:['English','Bangla','Bilingual'].includes(p.language)?p.language:'English',style:['paper','ink','lilac'].includes(p.style)?p.style:'paper',
   status:p.status==='scheduled'&&!Number.isFinite(Date.parse(p.scheduledAt))?'draft':p.status,
   facebook:clean(p.facebook,5000),instagram:clean(p.instagram,5000),
   scheduledAt:Number.isFinite(Date.parse(p.scheduledAt))?new Date(p.scheduledAt).toISOString():null,
  }));
  const events=state.events.slice(0,40).filter(e=>e&&typeof e.text==='string'&&Number.isFinite(Date.parse(e.at))).map(e=>({id:clean(e.id,100),text:clean(e.text,300),at:new Date(e.at).toISOString()}));
  const connections={};for(const page of demoPages)connections[page.id]=Object.fromEntries(['facebook','instagram','website'].map(k=>[k,state.connections?.[page.id]?.[k]===true]));
  return {version:1,posts,events,connections};
 }catch{return createDemoState(now);}
}
export function demoDraft({pageId,brief,language='English',productId='tee',style='paper'},now=new Date()){
 const page=demoPages.find(p=>p.id===pageId);if(!page)throw new Error('Choose a demo Page.');
 const subject=clean(brief,240).trim();if(!subject)throw new Error('Add an idea or brief first.');
 const product=demoProducts.find(p=>p.id===productId)||demoProducts[0];
 const english=page.kind==='ecommerce'?`${product.name}. ${product.facts.join('. ')}. A considered addition to your everyday. Message us to find out more.`:page.kind==='news'?`SAMPLE STORY · ${subject}. This fictional example shows how a sourced story can become a clear, engaging post. What would you like to know next?`:`A moment for ${subject.toLowerCase()}. Start small, make it yours, and share one idea with someone who needs it.`;
 const bangla=page.kind==='ecommerce'?`${product.name} — প্রতিদিনের ব্যবহারে নতুন ভাবনা। বিস্তারিত জানতে মেসেজ করুন। কোন স্টাইলটি আপনার পছন্দ?`:page.kind==='news'?`নমুনা সংবাদ · ${subject}। এটি একটি কাল্পনিক উদাহরণ। আপনার এলাকার কোন গল্পটি জানতে চান?`:`${subject} — ছোট একটি ভাবনা থেকেই শুরু হতে পারে নতুন কিছু। আজ আপনার প্রথম পদক্ষেপ কী হবে?`;
 const text=language==='Bangla'?bangla:language==='Bilingual'?`${english}\n\n${bangla}`:english;
 return {id:'demo-'+now.getTime()+'-'+Math.random().toString(36).slice(2,8),pageId,brief:subject,productId:product.id,language,style,status:'draft',scheduledAt:null,
  title:page.kind==='ecommerce'?product.short:page.kind==='news'?'A story worth sharing.':'Small ideas. New possibilities.',
  facebook:text+'\n\n#'+(page.kind==='news'?'Community #SampleStory':page.kind==='ecommerce'?'EverydayEssentials #FormaSupply':'CreativePractice #StudioNotes'),
  instagram:(language==='English'?(page.kind==='ecommerce'?`${product.short}\n${product.name}.\n${product.facts.join(' · ')}.\nMessage us for details.`:english):text)+'\n\n#'+(page.kind==='news'?'CommunityStories #TheDailyEdit':page.kind==='ecommerce'?'EverydayStyle #FormaSupply':'CreativeIdeas #StudioNotes')};
}
export function updateDemoPost(state,id,changes,now=new Date()){
 const current=state.posts.find(p=>p.id===id);if(!current)throw new Error('This demo post no longer exists.');
 const allowed=Object.fromEntries(['title','facebook','instagram','style','status','scheduledAt'].filter(k=>k in changes).map(k=>[k,changes[k]]));
 if(allowed.status&&!statuses.has(allowed.status))throw new Error('Choose a valid demo status.');
 if((allowed.status||current.status)==='scheduled'){
  const at=new Date(allowed.scheduledAt??current.scheduledAt);if(!Number.isFinite(+at)||at<=now)throw new Error('Choose a future date and time.');allowed.scheduledAt=at.toISOString();
 }
 return {...state,posts:state.posts.map(p=>p.id===id?{...p,...allowed}:p)};
}
export const localDateInput=date=>{const d=new Date(date);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16);};
