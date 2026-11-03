import { mkdir, writeFile } from 'node:fs/promises';
import Parser from 'rss-parser';
const sources = [
  ['প্রথম আলো','https://www.prothomalo.com',['/feed/','/rss.xml']],
  ['সমকাল','https://samakal.com',['/rss.xml','/feed']],
  ['যুগান্তর','https://www.jugantor.com',['/rss.xml','/feed/']],
  ['ইত্তেফাক','https://www.ittefaq.com.bd',['/rss.xml','/feed/']],
  ['কালের কণ্ঠ','https://www.kalerkantho.com',['/rss.xml','/rss/rss.xml']],
  ['বাংলাদেশ প্রতিদিন','https://www.bd-pratidin.com',['/rss.xml','/feed/']],
  ['বাংলা ট্রিবিউন','https://www.banglatribune.com',['/feed/','/rss.xml']],
  ['জাগো নিউজ','https://www.jagonews24.com',['/rss/rss.xml','/rss.xml']],
  ['ঢাকা পোস্ট','https://www.dhakapost.com',['/rss.xml','/rss/rss.xml']],
  ['বিডিনিউজ২৪ বাংলা','https://bangla.bdnews24.com',['/rss.xml','/feed/']],
  ['বাংলানিউজ২৪','https://www.banglanews24.com',['/rss/rss.xml','/rss.xml']],
  ['রাইজিংবিডি','https://www.risingbd.com',['/rss.xml','/rss/rss.xml']],
  ['বার্তা২৪','https://barta24.com',['/rss.xml','/feed/']],
  ['ঢাকা টাইমস','https://www.dhakatimes24.com',['/rss.xml','/feed/']],
  ['দেশ রূপান্তর','https://www.deshrupantor.com',['/rss.xml','/feed/']],
  ['জনকণ্ঠ','https://www.dailyjanakantha.com',['/rss.xml','/feed/']],
  ['আমাদের সময়','https://www.dainikamadershomoy.com',['/feed/','/rss.xml']],
  ['চ্যানেল আই','https://www.channelionline.com',['/feed/','/rss.xml']],
  ['যমুনা টিভি','https://jamuna.tv',['/feed/','/rss.xml']],
  ['এনটিভি','https://www.ntvbd.com',['/rss.xml','/feed/']],
  ['সময় সংবাদ','https://www.somoynews.tv',['/rss.xml','/feed/']],
  ['আরটিভি','https://www.rtvonline.com',['/rss/rss.xml','/rss.xml']],
  ['একাত্তর','https://ekattor.tv',['/rss.xml','/feed/']],
  ['ডেইলি স্টার বাংলা','https://bangla.thedailystar.net',['/rss.xml','/feed/']],
  ['আমার দেশ','https://www.dailyamardesh.com',['/rss.xml','/feed/']],
  ['ইনকিলাব','https://dailyinqilab.com',['/rss.xml','/feed/']],
  ['মানবজমিন','https://mzamin.com',['/rss.xml','/feed/']],
  ['নয়াদিগন্ত','https://www.dailynayadiganta.com',['/rss.xml','/rss/rss.xml']],
  ['সংবাদ প্রতিদিন','https://www.sangbadpratidin.in',['/feed/','/rss.xml']],
  ['আনন্দবাজার','https://www.anandabazar.com',['/rss','/rss/west-bengal']],
  ['এই সময়','https://eisamay.com',['/rssfeedstopstories.cms','/rss.xml']],
  ['আজকাল','https://aajkaal.in',['/rss.xml','/feed/']],
  ['বাংলা হিন্দুস্তান টাইমস','https://bangla.hindustantimes.com',['/rss','/rss.xml']],
  ['গণশক্তি','https://ganashakti.com',['/feed/','/rss.xml']],
  ['কালবেলা','https://www.kalbela.com',['/rss.xml','/feed/']],
  ['আজকের পত্রিকা','https://www.ajkerpatrika.com',['/rss.xml','/feed/']],
  ['বণিক বার্তা','https://bonikbarta.com',['/rss.xml','/feed/']],
  ['নিউজ বাংলা','https://www.newsbangla24.com',['/rss.xml','/feed/']],
  ['ঢাকাপ্রকাশ','https://www.dhakaprokash24.com',['/rss.xml','/feed/']],
  ['প্রতিদিনের সংবাদ','https://www.protidinersangbad.com',['/rss.xml','/feed/']],
  ['খবর সংযোগ','https://www.khoborsangjog.com',['/rss.xml','/feed/']],
  ['ভোরের পাতা','https://www.dailyvorerpata.com',['/rss.xml','/feed/']],
  ['ভোরের কাগজ','https://www.bhorerkagoj.com',['/rss.xml','/feed/']],
  ['দেশ টিভি','https://www.desh.tv',['/rss.xml','/feed/']],
  ['একুশে টিভি','https://www.ekushey-tv.com',['/rss.xml','/feed/']],
  ['সারাবাংলা','https://sarabangla.net',['/feed/','/rss.xml']],
  ['ঢাকা মেইল','https://dhakamail.com',['/rss.xml','/feed/']],
  ['দৈনিক বাংলা','https://www.dainikbangla.com.bd',['/rss.xml','/feed/']],
  ['বাংলাদেশ জার্নাল','https://www.bd-journal.com',['/rss/rss.xml','/rss.xml']],
  ['বিডি২৪লাইভ','https://www.bd24live.com',['/bangla/feed/','/feed/']],
  ['বায়ান্ন','https://bayanno.com',['/rss.xml','/feed/']],
  ['বাংলা ইনসাইডার','https://www.banglainsider.com',['/rss.xml','/feed/']],
  ['নিউজ২৪','https://www.news24bd.tv',['/rss.xml','/feed/']],
  ['বাংলা ঢাকা ট্রিবিউন','https://bangla.dhakatribune.com',['/rss.xml','/feed/']],
  ['বাংলা আউটলুক','https://www.banglaoutlook.org',['/rss.xml','/feed/']],
  ['প্রতিদিনের বাংলাদেশ','https://protidinerbangladesh.com',['/rss.xml','/feed/']],
];
const parser = new Parser();
async function get(url, root) {
  for (let i=0;i<4;i++) {
    const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(8000),headers:{'User-Agent':'EchoLink-RSS-Validator/1.0'}});
    if([301,302,303,307,308].includes(r.status)) {
      const next=new URL(r.headers.get('location'),url);
      if(next.protocol!=='https:' || next.hostname.replace(/^www\./,'')!==new URL(root).hostname.replace(/^www\./,''))throw new Error('Cross-host redirect');
      await r.body?.cancel();url=next.toString();continue;
    }
    if(!r.ok){await r.body?.cancel();throw new Error(`HTTP ${r.status}`);}
    const chunks=[];let length=0;
    for await(const chunk of r.body){length+=chunk.length;if(length>2000000)throw new Error('Too large');chunks.push(chunk);}
    return {url,text:Buffer.concat(chunks).toString('utf8')};
  }
  throw new Error('Redirect limit');
}
const results=new Array(sources.length);let index=0;
async function worker(){while(index<sources.length){const i=index++;const [name,root,paths]=sources[i];let verified;const failures=[];
  for(const path of paths){try{
    const response=await get(root+path,root),feed=await parser.parseString(response.text),items=feed.items.slice(0,20);
    const bangla=items.filter(item=>/[\u0980-\u09FF]/.test(item.title||'')).length;
    if(items.length<3||bangla/items.length<0.6)throw new Error('Insufficient Bangla news items');
    verified={name,publisher:new URL(root).hostname.replace(/^www\./,''),url:response.url,verified:true,itemCount:feed.items.length,banglaTitleRatio:bangla/items.length,articleHosts:[...new Set(items.filter(x=>x.link).map(x=>{try{return new URL(x.link).hostname}catch{return ''}}))].filter(Boolean),latestDate:feed.items.find(x=>x.isoDate)?.isoDate||null};break;
  }catch(e){failures.push({url:root+path,error:e.message});}}
  results[i]=verified||{name,publisher:new URL(root).hostname.replace(/^www\./,''),verified:false,failures};
  console.log(`${verified?'VERIFIED':'UNVERIFIED'} ${name}${verified?' ('+verified.itemCount+' items)':''}`);
}}
await Promise.all(Array.from({length:5},worker));
await mkdir('sources',{recursive:true});
const count=results.filter(r=>r.verified).length;
await writeFile('sources/bangla-rss-catalog.json',JSON.stringify({checkedAt:new Date().toISOString(),targetDistinctPublishers:20,verifiedPublishers:count,sources:results},null,2)+'\n');
console.log(`Verified ${count} distinct Bangla publishers out of ${sources.length} candidates; goal requires 20.`);
