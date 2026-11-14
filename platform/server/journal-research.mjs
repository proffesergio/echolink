import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import {outbound,publicURL} from './net.mjs';
import {readFeed} from './catalog.mjs';
import {AppError} from './errors.mjs';

const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
const audio=/\b(audio|earbuds?|headphones?|headsets?|neckbands?|noise cancel|auracast)\b/i;
const excluded=/\b(hearing aids?|hearing loss|health|medical|treatment|prescription|supplements?|gambling|investments?)\b/i;
export const journalTopicKey=topic=>createHash('sha256').update(topic.key||topic.sources.map(s=>s.url).sort().join('|')+'|'+topic.title).digest('hex');
export const relevantJournalTopic=title=>audio.test(title)&&!excluded.test(title);
export function trustedJournalURL(value,hosts){const u=publicURL(value);if(!hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))throw new AppError(400,'Journal research must use the configured trusted source domains.');return u.href;}
export async function readJournalSource(source,{hosts,send=outbound}={}){
 const url=trustedJournalURL(source.url,hosts),response=await send(url,{timeout:20000,maxBytes:700000});
 if(!response.ok)throw new AppError(503,'A journal evidence source is temporarily unavailable.');
 const $=load(response.bytes.toString());$('script,style,nav,footer,header,aside,form,[role=navigation]').remove();
 const root=$('main').first().length?$('main').first():$('article').first().length?$('article').first():$('body');
 const paragraphs=[...new Set(root.find('p,li').map((_,el)=>clean($(el).text())).get().filter(t=>t.length>=45&&t.length<=1600))].slice(0,100);
 if(!paragraphs.length)throw new AppError(422,'The journal source did not expose usable article evidence.');
 return {title:clean(source.title||root.find('h1').first().text()).slice(0,200),url,paragraphs};
}
export function journalPassages(source,topic,maxChars=1850){
 const keywords=new Set((topic.keyword+' '+topic.title).toLowerCase().match(/[a-z]{4,}/g)||[]);
 const ranked=source.paragraphs.filter(text=>!excluded.test(text)).map((text,index)=>({text,index,score:[...keywords].reduce((n,k)=>n+Number(text.toLowerCase().includes(k)),0)+(index<2?1:0)+(/\b(only|require|depend|not all|cannot|limitations?|compatible|specific)\b/i.test(text)?1:0)})).sort((a,b)=>b.score-a.score||a.index-b.index);
 const selected=[];let size=0;for(const p of ranked){if(size+p.text.length+2>maxChars)continue;selected.push(p);size+=p.text.length+2;if(selected.length>=5)break;}
 return selected.sort((a,b)=>a.index-b.index).map(p=>p.text).join('\n\n');
}
export async function prepareJournalResearch({plan,usedKeys=[],products=[]},{readSource=readJournalSource,feed=readFeed}={}){
 const config=plan.automation||{},used=new Set(usedKeys),hosts=config.trustedHosts||[];
 let topic=(config.topics||[]).find(t=>!used.has(journalTopicKey(t))&&relevantJournalTopic(t.title));
 if(!topic){for(const url of config.feedUrls||[]){trustedJournalURL(url,hosts);const entries=await feed({url});const entry=entries.find(e=>relevantJournalTopic(e.title)&&!used.has(journalTopicKey({key:e.url})));if(entry){topic={key:entry.url,title:entry.title,keyword:entry.title,problem:'Understand this Bluetooth audio development and its compatibility limitations before choosing equipment.',intent:'how_to',sources:[{title:entry.title,url:entry.url},...(config.referenceSources||[]).slice(0,1)]};break;}}}
 if(!topic)return null;
 const sources=[],seen=new Set();for(const source of topic.sources.slice(0,3)){const url=trustedJournalURL(source.url,hosts);if(seen.has(url))continue;seen.add(url);sources.push(await readSource(source,{hosts}));}
 if(sources.length<2)throw new AppError(422,'Automatic journal guides need at least two attributable source pages.');
 let body=sources.map(s=>'Source: '+s.title+'\n'+journalPassages(s,topic,Math.floor(3200/sources.length))).join('\n\n');
 if(body.split(/\s+/).length<160)throw new AppError(422,'The available evidence is too thin for a complete journal guide.');
 const candidates=products.filter(p=>p.available&&relevantJournalTopic(p.title)&&p.image_url).slice(0,2);
 if(!candidates.length)throw new AppError(422,'A relevant catalog image and product context are required before automatic journal writing.');
 const cards=candidates.map(p=>({id:p.external_id,title:p.title,platform:'fabrything',url:p.url,sourceUrl:p.url,image:p.image_url,imageAlt:p.title,specs:Object.fromEntries(Object.entries(p.attributes?.specifications||{}).filter(([k])=>!/price|cost|discount/i.test(k)).slice(0,4))}));
 for(const card of cards){const context='\n\nCatalog context (not a hands-on test or international shipping promise): '+card.title+'\n'+JSON.stringify(card.specs);if(body.length+context.length<=4800)body+=context;else card.specs={};}
 return {title:topic.title,body,sourceUrl:sources[0].url,key:journalTopicKey(topic),brief:{problem:topic.problem,keyword:topic.keyword,intent:topic.intent||'how_to',sources:sources.map(({title,url})=>({title,url})),products:cards,images:[{type:'image',alt:'Illustrative catalog product: '+cards[0].title,src:cards[0].image,width:1200,height:1200,variants:[]}]},research:{at:new Date().toISOString(),key:journalTopicKey(topic),sourceCount:sources.length,method:'Trusted source passages and current catalog context; no first-hand testing claim.'}};
}
