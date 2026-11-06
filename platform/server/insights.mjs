import {z} from 'zod';
import {AppError} from './errors.mjs';
const count=z.number().finite().int().min(0).max(1e12).default(0);
const record=z.object({postId:z.string().max(200).default(''),type:z.enum(['photo','video','reel','text','link','other']).default('other'),title:z.string().max(300).default(''),publishedAt:z.string().datetime({offset:true}),reach:count,reactions:count,comments:count,shares:count,clicks:count,messages:count,purchases:count});
export function insightRecords(input){const parsed=z.array(record).min(1).max(500).safeParse(input);if(!parsed.success)throw new AppError(400,'Import 1–500 records with publishedAt (ISO date), type and non-negative numeric metrics.');return parsed.data;}
export function summarizeInsights(records=[],timezone='Asia/Dhaka'){
 const groups=new Map(),hours=new Map();let reach=0,engagement=0;
 for(const r of records){const score=(r.reactions||0)+(r.comments||0)*2+(r.shares||0)*3,e=groups.get(r.type)||{type:r.type,posts:0,score:0};e.posts++;e.score+=score;groups.set(r.type,e);reach+=r.reach||0;engagement+=score;const hour=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',hourCycle:'h23'}).format(new Date(r.publishedAt)),h=hours.get(hour)||{hour,posts:0,score:0};h.posts++;h.score+=score;hours.set(hour,h);}
 const types=[...groups.values()].map(r=>({...r,average:Math.round(r.score/r.posts*100)/100})).sort((a,b)=>b.average-a.average),bestHour=[...hours.values()].filter(h=>h.posts>=3).sort((a,b)=>b.score/b.posts-a.score/a.posts)[0];
 return {sampleSize:records.length,reach,weightedEngagement:engagement,types,bestHour:bestHour?.hour||null,confidence:records.length<5?'limited sample':'observational',recommendation:records.length<5?'Import at least five posts before choosing a content experiment.':`Try one ${types[0]?.type||'photo'} post with a new, factual angle. Compare results with this Page’s own baseline.`,note:'Reactions + 2×comments + 3×shares is an EchoLink comparison score, not Meta reach or a sales forecast.'};
}
