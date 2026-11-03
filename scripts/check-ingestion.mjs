import '../src/env.mjs';
import {readFile} from 'node:fs/promises';
import {query,closePools} from '../src/db.mjs';
import {ingest} from '../src/jobs.mjs';
if(process.env.ECHOLINK_INGESTION_PROBE!=='true'||!process.env.NEON_BRANCH?.startsWith('dev-ingest-'))throw new Error('This probe may run only on its isolated temporary Neon branch');
process.env.DRY_RUN='true';process.env.FEED_CONCURRENCY='4';process.env.MAX_ITEMS_PER_FEED='1';
const sources=JSON.parse(await readFile('sources/bangla-rss-catalog.json','utf8')).sources.filter(s=>s.verified);
const urls=new Set(sources.map(s=>s.url));
const pages=(await query("SELECT id,config FROM echolink.configurations WHERE kind='page'")).rows;
const feeds=(await query("SELECT id,config FROM echolink.configurations WHERE kind='feed'")).rows.filter(r=>urls.has(r.config.url));
if(!pages.length||feeds.length<20)throw new Error('Need the synced page and 20 verified publisher configurations');
const page=pages[0];
await query("UPDATE echolink.configurations SET config=jsonb_set(config,'{active}','false'::jsonb)");
await query("UPDATE echolink.configurations SET config=$2 WHERE kind='page' AND id=$1",[page.id,JSON.stringify({...page.config,active:true,fbPageId:'0',model:'PROBE-NO-INFERENCE'})]);
for(const feed of feeds)await query("UPDATE echolink.configurations SET config=$2 WHERE kind='feed' AND id=$1",[feed.id,JSON.stringify({...feed.config,active:true,pages:[page.id]})]);
let active=0,maximum=0,requests=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(...args)=>{
  const u=new URL(args[0].url||String(args[0]));
  if(u.hostname==='graph.facebook.com'||u.hostname==='api.airtable.com')throw new Error('External writes are forbidden in this probe');
  active++;maximum=Math.max(maximum,active);requests++;
  try{return await originalFetch(...args);}finally{active--;}
};
try{
  const first=await ingest();
  if(maximum<2||maximum>4)throw new Error('Concurrent network requests did not honor the configured bound');
  if(first.inserted<1||first.failedFeeds>0)throw new Error(`Ingestion incomplete: ${JSON.stringify(first)}`);
  const firstRequests=requests;
  console.log(`PASS live RSS ingestion on isolated branch: ${feeds.length} publisher configurations; ${JSON.stringify(first)}; max network concurrency=${maximum}; requests=${requests}.`);
  const second=await ingest();
  if(second.duplicates<1)throw new Error('Repeated ingestion did not find existing stories');
  console.log(`PASS repeated ingestion: ${JSON.stringify(second)}; second-run requests=${requests-firstRequests}; duplicates avoided article re-fetch.`);
  const counts=(await query("SELECT (SELECT count(*)::int FROM echolink.articles WHERE status='Posted') AS posted,(SELECT count(*)::int FROM echolink.source_comments) AS comments")).rows[0];
  if(counts.posted!==0||counts.comments!==0)throw new Error('Probe unexpectedly reached publishing state');
  console.log('PASS isolation: no Facebook post/comment or Airtable write attempted; real news test data stays only on the disposable branch.');
}finally{globalThis.fetch=originalFetch;await closePools();}
