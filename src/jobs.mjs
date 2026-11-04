import { randomUUID } from 'node:crypto';
import { query, transaction } from './db.mjs';
import { allRecords, airtable, tables } from './airtable.mjs';
import { hash, canonicalUrl, titleHash, normalizePage, inWindow, generationBody, sourceCommentReady } from './core.mjs';
import {graphRequest,deliveryGate,FacebookError,checkFacebookConnection,clearConnectionPause} from './facebook.mjs';
import {reportProgress} from './telemetry.mjs';
import {withSuggestedHashtags,needsReview} from './publishing-policy.mjs';
import {editorialReviewReason} from './editorial.mjs';
import {publishWebsite,WebsiteError,validateWebsiteConfiguration,websiteConfiguration,websiteApplies} from './website.mjs';
import {automaticLinksEnabled,captionLinkProblem,sourceCommentMessage} from './link-policy.mjs';
import { request, jsonRequest, hostList, HttpError } from './net.mjs';
import {publishedAt,rankNews,generationResult,draftQuality,contentPanel} from './newsroom.mjs';
import {syncSheet} from './sheets.mjs';
import {findSemanticDuplicate,SemanticError} from './semantic.mjs';

const tokens = key => JSON.parse(process.env[key] || '{}');
const dryRun = () => process.env.DRY_RUN !== 'false';
const bearer = token => token ? { Authorization: `Bearer ${token}` } : {};
const settings = async kind => (await query('SELECT id,config FROM echolink.configurations WHERE kind=$1 ORDER BY id', [kind])).rows;
async function update(id, values) {
  const allowed = new Set(['status','caption','caption_hash','approval_hash','vector','vector_model','fb_post_id','airtable_id','notified_at','attempts','next_attempt_at','last_error','published_at','selection_score','selection_reason','analysis','image_prompt','scheduled_at','image_url']);
  const entries = Object.entries(values);
  if (!entries.length || entries.some(([k]) => !allowed.has(k))) throw new Error('Invalid article update');
  await query(`UPDATE echolink.articles SET ${entries.map(([k], i) => `${k}=$${i + 2}`).join(',')},dirty=true,updated_at=now() WHERE id=$1`, [id, ...entries.map(([, v]) => v)]);
}
async function locked(name, fn) {
  return transaction(async client => {
    const result = await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired', [`echolink:${name}`]);
    if (!result.rows[0].acquired) return { busy: true };
    return fn();
  }, { coordination: true });
}
export async function sync() {
  return locked('sync', async () => {
    await reportProgress(0,3,'Loading Page settings from Airtable');
    const pages = (await allRecords(tables().pages)).map(normalizePage);
    await reportProgress(1,3,'Loading feed settings',`${pages.length} Page configurations loaded`);
    const feeds = (await allRecords(tables().feeds)).map(r => ({ id: r.id, name:r.fields['Feed Name']||r.id, active: r.fields['Active Status'] === true, pages: r.fields['Linked Page'] || [], url: r.fields['RSS / Scraper URL'], fallback: r.fields['Fallback URL'] || null }));
    await reportProgress(2,3,'Saving settings to Neon',`${feeds.length} feed configurations loaded`);
    await transaction(async client => {
      await client.query('DELETE FROM echolink.configurations');
      for (const [kind, rows] of [['page', pages], ['feed', feeds]]) for (const row of rows) {
        await client.query('INSERT INTO echolink.configurations(kind,id,config) VALUES($1,$2,$3)', [kind, row.id, JSON.stringify(row)]);
      }
    });
    return { pages: pages.length, feeds: feeds.length };
  });
}
export async function extract(feed,fetcher=request,{limit:limitOverride}={}) {
  const { default: Parser } = await import('rss-parser');
  const parser = new Parser({ customFields: { item: [['media:content', 'media'], ['media:thumbnail', 'thumbnail']] } });
  let lastError;
  for(const url of [feed.url,feed.fallback].filter(Boolean)) {
    try {
      const xml=await fetcher(url,{}, {hosts:hostList('ALLOWED_SOURCE_HOSTS'),timeoutMs:15000});
      const parsed=await parser.parseString(xml);
      if(!parsed.items?.length)throw new Error('Empty feed');
      const limit=Math.max(1,Math.min(25,Number(limitOverride||process.env.MAX_ITEMS_PER_FEED)||5));
      return parsed.items.slice(0,limit);
    }catch(e){lastError=e;}
  }
  throw lastError;
}
async function audit(page,feed,title,url,status,detail){
  const key=hash(`${page}|${feed.id}|${url}|${status}`);
  await query(`INSERT INTO echolink.ingestion_events(id,event_key,page_id,title,source_url,status,detail)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(event_key) DO UPDATE SET occurrences=echolink.ingestion_events.occurrences+1,updated_at=now()`,[randomUUID(),key,page,title,url,status,detail]);
}
async function articleFrom(item) {
  const { load } = await import('cheerio');
  const source = canonicalUrl(item.link);
  const readable=html=>{
    const $=load(html);$('script,style,nav,footer,header,aside,[class*="related"],[id*="related"],[class*="share"],[class*="comment"],[class*="advert"]').remove();
    $('a').each((_,el)=>{const a=$(el),parent=a.parent();if(a.text().trim().length>25&&parent.text().trim()===a.text().trim())a.remove();});
    const container=$('article').length?$('article'):$('main').length?$('main'):$('body');
    const paragraphs=container.find('p').map((_,p)=>$(p).text().trim()).get().filter(Boolean);
    return (paragraphs.join(' ').length>80?paragraphs.join(' '):container.text()).split(/আরও পড়ুন|আরও পড়ুন|পরবর্তী সংবাদ|বিষ[য়য়]:/u)[0];
  };
  let body = readable(item['content:encoded'] || item.content || item.contentSnippet || item.summary || '');
  let image = item.enclosure?.type?.startsWith('image/') ? item.enclosure.url : item.media?.$?.url || item.thumbnail?.$?.url || null;
  try {
    const html = await request(source, {}, { hosts: hostList('ALLOWED_SOURCE_HOSTS'), timeoutMs: Number(process.env.ARTICLE_TIMEOUT_MS || 15000) });
    const $ = load(html); $('script,style,nav,footer,header,aside').remove();
    const extracted = readable(html);
    if (extracted.trim().length > body.length) body = extracted;
    image ||= $('meta[property="og:image"]').attr('content') || null;
  } catch { /* RSS text remains usable when article extraction is unavailable. */ }
  if (image) {
    try { image = new URL(image, source).toString(); if (!image.startsWith('https://')) image = null; }
    catch { image = null; }
  }
  return { title: String(item.title || '').trim(), source, body: body.replace(/\s+/g, ' ').trim().slice(0, 50000), image };
}
export async function ingest(options={}) {
  return locked('ingest', async () => {
    const pages = new Map((await settings('page')).filter(r => r.config.active&&(!options.pageId||r.id===options.pageId)).map(r => [r.id, r.config]));
    let inserted = 0, duplicates = 0, failedFeeds = 0;
    const feeds=(await settings('feed')).filter(r=>r.config.active&&r.config.pages.some(id=>pages.has(id)));let feedIndex=0,seenItems=0,missingDates=0;
    let completedFeeds=0;await reportProgress(0,Math.max(1,feeds.length),'Fetching RSS sources',`${feeds.length} enabled feeds`);
    if(!pages.size)return {blocked:true,reason:'No enabled page is configured',activePages:0,activeFeeds:feeds.length,inserted:0,duplicates:0,failedFeeds:0};
    if(!feeds.length)return {blocked:true,reason:'No enabled feeds are linked to the enabled page. Enable news sources in News feeds.',activePages:pages.size,activeFeeds:0,inserted:0,duplicates:0,failedFeeds:0};
    async function consume(){while(feedIndex<feeds.length){const {config:feed}=feeds[feedIndex++];
      const targets = feed.pages.filter(id => pages.has(id));
      if (!targets.length) continue;
      try {
        for (const item of await extract(feed,request,{limit:options.limitPerFeed})) {
          if (!item.link || !item.title) continue;
          seenItems++;const date=publishedAt(item);if(!date)missingDates++;
          let source;
          try { source=canonicalUrl(item.link); } catch {
            for(const page of targets)await audit(page,feed,item.title,feed.url,'Failed','Invalid article URL in feed');
            continue;
          }
          const existing=(await query('SELECT page_id FROM echolink.articles WHERE page_id=ANY($1::text[]) AND (url_hash=$2 OR title_hash=$3)',[targets,hash(source),titleHash(item.title)])).rows;
          const seen=new Set(existing.map(r=>r.page_id));
          for(const page of seen){duplicates++;await audit(page,feed,item.title,source,'Skipped (Duplicate)','Existing canonical URL or normalized title for this page');}
          const remaining=targets.filter(page=>!seen.has(page));
          if(!remaining.length)continue;
          let a;
          try { a = await articleFrom(item); } catch {
            for(const page of remaining)await audit(page,feed,item.title,feed.url,'Failed','Invalid or disallowed article URL');
            continue;
          }
          if (a.body.length < 80) {for(const page of remaining)await audit(page,feed,a.title,a.source,'Failed','Insufficient article text after extraction fallback');continue;}
          for (const page of remaining) {
            const result = await query(`INSERT INTO echolink.articles(id,page_id,url_hash,title_hash,title,source_url,body,image_url,source_published_at,publisher)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`, [randomUUID(), page, hash(a.source), titleHash(a.title), a.title, a.source, a.body, a.image,date,new URL(a.source).hostname.replace(/^www\./,'')]);
            inserted += result.rowCount; duplicates += result.rowCount ? 0 : 1;
            if(!result.rowCount)await audit(page,feed,a.title,a.source,'Skipped (Duplicate)','Existing canonical URL or normalized title for this page');
          }
        }
      } catch { failedFeeds++;for(const page of targets)await audit(page,feed,feed.name,feed.url,'Failed','Primary feed and configured fallback could not be fetched or parsed'); }
      finally{await reportProgress(++completedFeeds,feeds.length,'Collecting and deduplicating news',`${completedFeeds}/${feeds.length} feeds checked; ${inserted} new; ${duplicates} duplicates; ${failedFeeds} failed feeds`);}
    }}
    const concurrency=Math.max(1,Math.min(8,Number(process.env.FEED_CONCURRENCY)||4));
    await Promise.all(Array.from({length:Math.min(concurrency,feeds.length)},consume));
    return { inserted, duplicates, failedFeeds,activePages:pages.size,activeFeeds:feeds.length,seenItems,missingDates,...(!inserted?{reason:duplicates?'All fetched articles already exist for this page':'No usable article text found; inspect feed audit events'}:{}) };
  });
}
function aiEndpoint(page) {
  if (page.infrastructure === 'Neon AI Gateway') return { url: `${process.env.NEON_AI_GATEWAY_BASE_URL}/v1/chat/completions`, token: process.env.NEON_AI_GATEWAY_TOKEN };
  return { url: page.endpoint, token: tokens('AI_TOKENS_JSON')[page.aiSecret] };
}
export async function generate(page, article,{onRetry=async()=>{},onAttempt=async()=>{},bodyBuilder=generationBody,checkAnalysisLanguage=false}={}) {
  const endpoint = aiEndpoint(page);
  const gateway = page.infrastructure === 'Neon AI Gateway';
  const hosts = gateway ? [new URL(process.env.NEON_AI_GATEWAY_BASE_URL).hostname] : hostList('ALLOWED_AI_HOSTS');
  let lastError;
  for(let attempt=0;attempt<2;attempt++){
    if(attempt)await onRetry(lastError,attempt);
    const body=bodyBuilder(page,article);
    if(bodyBuilder===generationBody)body.messages[0].content+=' If the supplied article contains conflicting figures or unresolved factual contradictions, do not resolve them by guessing. Start analysis with the exact marker EDITORIAL REVIEW REQUIRED and explain the uncertainty.';
    if(attempt)body.messages[0].content+=bodyBuilder===generationBody
      ?' Your previous output was incomplete or too short. Return a complete JSON object and a substantial 2-paragraph caption of at least 180 characters; summarize only facts in the supplied article.'
      :page.language==='Bangla'
      ?`\nআগের উত্তরের কাঠামোগত ত্রুটি: ${lastError?.message||'অসম্পূর্ণ উত্তর'}। আবার সম্পূর্ণ JSON দাও। post_text-এ অন্তত ১৮০ অক্ষরের পূর্ণ পোস্ট এবং analysis-এ সংক্ষিপ্ত তথ্য বাংলায় দাও। শুধু সূত্রের তথ্য ব্যবহার করো; বড় করার জন্য কিছু বানাবে না।`
      :`\nPrevious output failed validation: ${lastError?.message||'Incomplete output'}. Return complete JSON and a caption of at least 180 characters using only source-supported facts in the requested language.`;
    let response;
    try{response=await jsonRequest(endpoint.url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...bearer(endpoint.token) }, body: JSON.stringify(body) }, { hosts, local: !gateway, timeoutMs: Number(process.env.AI_TIMEOUT_MS || 300000) });}
    catch(error){if(!gateway&&attempt===0&&error instanceof HttpError&&[429,500,502,503].includes(error.status)){lastError=error;continue;}throw error;}
    await onAttempt({attempt:attempt+1,text:String(response.choices?.[0]?.message?.content||'').slice(0,12000),finishReason:response.choices?.[0]?.finish_reason||null,usage:response.usage||null});
    try{const result=generationResult(response.choices?.[0]?.message?.content,article);const error=draftQuality(result,page,article,{analysisLanguage:checkAnalysisLanguage});if(error)throw new Error(error);return result;}catch(error){lastError=error;}
  }
  throw lastError;
}
async function dailyCount(page) {
  const r = await query(`SELECT count(*)::int AS count FROM echolink.articles WHERE page_id=$1
    AND ((status='Posted' AND (published_at AT TIME ZONE $2)::date=(now() AT TIME ZONE $2)::date)
      OR (status IN ('Publishing','Publish Unknown') AND (updated_at AT TIME ZONE $2)::date=(now() AT TIME ZONE $2)::date))`, [page.id, page.timezone]);
  return r.rows[0].count;
}
async function gapSatisfied(page) {
  const r = await query("SELECT NOT EXISTS (SELECT 1 FROM echolink.articles WHERE page_id=$1 AND ((status='Posted' AND published_at>now()-($2::double precision*interval '1 minute')) OR status IN ('Publishing','Publish Unknown'))) AS allowed", [page.id, page.minimumGap]);
  return r.rows[0].allowed;
}
function graphBase() {
  if (!/^v\d+\.\d+$/.test(process.env.META_GRAPH_VERSION || '')) throw new Error('Set a supported META_GRAPH_VERSION');
  return `https://graph.facebook.com/${process.env.META_GRAPH_VERSION}`;
}
export async function publish(page, article, transport=(url,options,policy)=>graphRequest(page.id,url,options,policy)) {
  const linkProblem=captionLinkProblem(article);if(linkProblem)throw new Error(linkProblem);
  const token = tokens('FB_TOKENS_JSON')[page.fbSecret];
  if (!token) throw new Error('Facebook token alias is missing');
  const base = graphBase();
  const send = async image => {
    const payload = image ? { url: image, caption: article.caption } : { message: article.caption };
    return transport(`${base}/${encodeURIComponent(page.fbPageId)}/${image ? 'photos' : 'feed'}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...bearer(token) }, body: JSON.stringify(payload) }, { hosts: ['graph.facebook.com'] });
  };
  // Honor the reviewed image choice. A rejected image must not silently become
  // a text-only post; the editor can remove/change it and retry explicitly.
  return send(article.image_url);
}
export async function publicationReadiness(pageId){
  const page=(await settings('page')).find(r=>r.id===pageId)?.config;
  if(!page?.active)return {ready:false,reason:'Enable this Page before publishing'};
  if(dryRun())return {ready:false,reason:'Dry-run is enabled. Switch publishing mode in Settings before Publish Now'};
  if(websiteApplies(page)&&websiteConfiguration().requireBeforeFacebook){try{validateWebsiteConfiguration();}catch(error){return {ready:false,reason:error.message};}}
  if(!/^\d+$/.test(page.fbPageId||''))return {ready:false,reason:'Save a numeric Facebook Page ID under Pages & models'};
  if(!tokens('FB_TOKENS_JSON')[page.fbSecret])return {ready:false,reason:'Save a Page access token under Connections using this Page’s FB Secret Alias'};
  if(!/^v\d+\.\d+$/.test(process.env.META_GRAPH_VERSION||''))return {ready:false,reason:'Save the Graph API version in Connections → Facebook Page token'};
  const connection=await checkFacebookConnection(page);if(!connection.publishReady)return {ready:false,reason:connection.reason};
  await clearConnectionPause(pageId);
  const gate=await deliveryGate(pageId);if(!gate.ready)return gate;
  if(!inWindow(new Date(),page))return {ready:false,reason:'Outside this Page’s posting window. Choose Schedule instead'};
  if(await dailyCount(page)>=page.dailyMax)return {ready:false,reason:'This Page has reached its daily posting cap'};
  if(!await gapSatisfied(page))return {ready:false,reason:'Minimum post spacing or an unresolved publication blocks this Page'};
  return {ready:true};
}
export async function processQueue(options={}) {
  const preview=options.preview===true;
  await reportProgress(0,5,'Checking Page rules and selecting news');
  await query("UPDATE echolink.articles SET status='Publish Unknown',dirty=true WHERE status='Publishing' AND updated_at<now()-interval '20 minutes'");
  const pages = (await settings('page')).filter(r => r.config.active&&(!options.pageId||r.id===options.pageId));
  const completedByPage=new Map();
  const stage=(page,completed,phase,detail='')=>{
    completedByPage.set(page.id,Math.max(completedByPage.get(page.id)||0,completed));
    return reportProgress([...completedByPage.values()].reduce((sum,n)=>sum+n,0),Math.max(1,pages.length*5),phase,detail);
  };
  const results = [];
  // Default to one model request at a time on small local machines.
  const configured = Number(process.env.PAGE_CONCURRENCY || 1);
  const concurrency = Number.isInteger(configured) ? Math.max(1, Math.min(3, configured)) : 1;
  for (let i = 0; i < pages.length; i += concurrency) results.push(...await Promise.all(pages.slice(i, i + concurrency).map(({ config: page }) => locked(`page:${page.id}`, async () => {
    if(!preview){const gate=await deliveryGate(page.id);if(!gate.ready)return {page:page.id,queued:gate.reason};}
    if (!preview&&!inWindow(new Date(), page)) return { page: page.id, queued: 'outside window' };
    if (!preview&&await dailyCount(page) >= page.dailyMax) return { page: page.id, queued: 'daily cap' };
    if (!preview&&!await gapSatisfied(page)) return { page: page.id, queued: 'minimum post gap or unresolved publication' };
    // Hold severely late schedules for fresh editorial review instead of flooding
    // the Page with yesterday's backlog after the PC or tunnel returns.
    if(!preview)await query("UPDATE echolink.articles SET status='Draft',approval_hash=NULL,scheduled_at=NULL,last_error='Scheduled time missed by over 6 hours. Held as Draft: review freshness and schedule again.',dirty=true,updated_at=now() WHERE page_id=$1 AND status='Approved' AND scheduled_at<now()-interval '6 hours'",[page.id]);
    const r = await query("SELECT id,title,body,source_url,image_url,caption,caption_hash,approval_hash,analysis,status,attempts,source_published_at,publisher,scheduled_at,website_post_id,website_url,website_status FROM echolink.articles WHERE page_id=$1 AND status IN ('Queued','Approved') AND next_attempt_at<=now() AND (scheduled_at IS NULL OR scheduled_at<=now()) AND ($2::uuid IS NULL OR id=$2) ORDER BY (status='Approved') DESC,scheduled_at ASC NULLS LAST,source_published_at DESC NULLS LAST,created_at DESC LIMIT 200", [page.id,options.articleId||null]);
    const ranked=rankNews(r.rows.filter(a=>!preview||!a.caption),page);
    const a=options.articleId?r.rows[0]:(!preview&&r.rows.find(a=>a.status==='Approved'))||ranked[0];
    if (!a) return { page: page.id, empty: true,reason:r.rows.length?'No eligible news dated today. Missing/old publication dates are excluded from top-news selection.':'Queue empty. Run ingestion with enabled feeds first.' };
    if(!preview&&!a.caption&&page.approval){const pending=(await query("SELECT count(*)::int AS n FROM echolink.articles WHERE page_id=$1 AND status='Pending Approval'",[page.id])).rows[0].n;if(pending>=3)return {page:page.id,queued:'Review queue has 3 drafts. Approve, hold as Draft or reject one before automatic generation continues.'};}
    if(a.selection_score!==undefined)await update(a.id,{selection_score:a.selection_score,selection_reason:a.selection_reason});
    try {
      await stage(page,1,'Preparing article and model input');
      if(process.env.SEMANTIC_ENABLED==='true')await stage(page,1,'Checking similarity against prior posts','Indexing missing historical embeddings before comparing this Page’s published stories');
      const duplicate=await findSemanticDuplicate(page,a);
      if(duplicate){
        const detail=`Semantic match to ${duplicate.status} article ${duplicate.id} (cosine ${duplicate.score.toFixed(4)}). Review the original story before reusing this item.`;
        await update(a.id,{status:'Skipped (Duplicate)',last_error:detail});
        return {page:page.id,duplicate:a.id,matchedArticle:duplicate.id,similarity:duplicate.score,reason:detail};
      }
      if (!a.caption) {
        await stage(page,2,'Local AI is generating the caption','Waiting for the configured model. Stage percentage is not a prediction of inference time.');
        const generated=await generate(page,a,{onRetry:error=>stage(page,2,'Correcting the AI output — one retry',error?.message||'The model returned an incomplete result; no post has been sent')});generated.caption=withSuggestedHashtags(generated.caption,a,page.language);Object.assign(a,generated);a.caption_hash=hash(a.caption);
        await update(a.id, { ...generated, caption_hash: a.caption_hash,last_error:null,attempts:0 });
      }
      if (needsReview(page,a,preview)) {
        const reviewReason=editorialReviewReason(a);
        await stage(page,5,'Draft prepared for human review',reviewReason||'Caption, selected photo and analysis saved; no publication requested');
        await update(a.id, { status: 'Pending Approval',last_error:reviewReason }); return { page:page.id,pending: a.id,title:a.title,selectedFrom:ranked.length,score:a.selection_score,reason:a.selection_reason,reviewReason,preview };
      }
      const linkProblem=captionLinkProblem(a);
      if(linkProblem){await update(a.id,{status:'Pending Approval',approval_hash:null,last_error:linkProblem});return {page:page.id,held:a.id,reason:linkProblem};}
      if (!inWindow(new Date(), page) || await dailyCount(page) >= page.dailyMax || !await gapSatisfied(page)) return { queued: a.id };
      if (dryRun()) { if(!a.scheduled_at)await update(a.id, { status: 'Dry Run' }); return { dryRun: a.id }; }
      // Validate all preconditions before creating a publish reservation.
      if (!tokens('FB_TOKENS_JSON')[page.fbSecret]) throw new Error('Facebook token alias is missing');
      graphBase();
      const connection=await checkFacebookConnection(page);if(!connection.publishReady)return {page:page.id,queued:connection.reason};
      await stage(page,2,'Preparing website publication','Website-first delivery applies only to configured Facebook Pages');
      let websiteFailure=null;
      try{const website=await publishWebsite(page,a);if(website)Object.assign(a,website);}
      catch(error){if(websiteConfiguration().requireBeforeFacebook)throw new WebsiteError(`${error.message} Required website delivery is not confirmed; Facebook is held.`);websiteFailure=error instanceof WebsiteError?error.message:'Optional website delivery failed; inspect its connection';}
      const finalGate=await deliveryGate(page.id);
      const latest=(await settings('page')).find(row=>row.id===page.id)?.config;
      if(!latest?.active)return {page:page.id,queued:a.id,reason:'Page disabled during preparation'};
      if(latest.fbPageId!==page.fbPageId||latest.fbSecret!==page.fbSecret)return {page:page.id,queued:a.id,reason:'Page connection changed during preparation; the next run will check it'};
      Object.assign(page,latest);
      if(!finalGate.ready||!inWindow(new Date(),page)||await dailyCount(page)>=page.dailyMax||!await gapSatisfied(page))return {page:page.id,queued:a.id,reason:finalGate.reason||'Page timing rules changed while preparing the website article'};
      await stage(page,3,'Sending reviewed post to Facebook',a.image_url?'Photo post selected':'Text-only post selected');
      const attempt = randomUUID();
      await transaction(async client => {
        await client.query("UPDATE echolink.articles SET status='Publishing',updated_at=now(),dirty=true WHERE id=$1", [a.id]);
        await client.query('INSERT INTO echolink.publish_attempts(id,article_id) VALUES($1,$2)', [attempt, a.id]);
      });
      try {
        const posted = await publish(page, a);
        const postId = posted.post_id || posted.id;
        if (!postId) throw new Error('Publishing response has no ID');
        await stage(page,4,'Facebook confirmed the post; saving delivery records');
        await transaction(async client => {
          await client.query("UPDATE echolink.articles SET status='Posted',fb_post_id=$2,published_at=now(),last_error=$3,updated_at=now(),dirty=true WHERE id=$1", [a.id, postId,websiteFailure]);
          await client.query("UPDATE echolink.publish_attempts SET outcome='Posted',remote_id=$2 WHERE id=$1", [attempt, postId]);
          await client.query(`INSERT INTO echolink.source_comments(article_id,page_id,fb_post_id,message,due_at)
            VALUES($1,$2,$3,$4,now()+($5::double precision*interval '1 minute')) ON CONFLICT DO NOTHING`, [a.id,page.id,postId,sourceCommentMessage(a),page.commentDelay]);
          if(!automaticLinksEnabled()||websiteFailure)await client.query("UPDATE echolink.source_comments SET status='Skipped',last_error=$2,updated_at=now() WHERE article_id=$1 AND status='Queued'",[a.id,websiteFailure?'Website link not confirmed; automatic link comment skipped':'Automatic Facebook links disabled by owner']);
        });
        return { posted: a.id,websiteStatus:websiteFailure?'Unknown':a.website_status||null,...(websiteFailure?{websiteWarning:websiteFailure}:{}) };
      } catch(error) {
        if(error instanceof FacebookError&&error.rateLimited){
          await update(a.id,{status:'Approved',next_attempt_at:new Date(Date.now()+error.retryAfter*1000),last_error:'Facebook rejected this attempt due to rate limits. Waiting for the server cooldown; no immediate retry.'});
          await query("UPDATE echolink.publish_attempts SET outcome='Throttled' WHERE id=$1",[attempt]);
          return {page:page.id,queued:a.id,reason:'Facebook cooldown'};
        }
        if(error instanceof HttpError&&error.status>=400&&error.status<500&&error.status!==408){
          const diagnostic=error instanceof FacebookError?error.diagnostic:`Facebook rejected publication (HTTP ${error.status}). Check Page permissions and the selected photo; no text-only fallback was sent`;
          await update(a.id,{status:'Failed',last_error:diagnostic});
          await query("UPDATE echolink.publish_attempts SET outcome='Failed' WHERE id=$1",[attempt]);
          return {page:page.id,failed:a.id,error:diagnostic,code:error.code,subcode:error.subcode};
        }
        await update(a.id, { status: 'Publish Unknown', last_error: 'Inspect Facebook and reconcile before retrying' });
        return { unknown: a.id };
      }
    } catch (e) {
      const attempts = a.attempts + 1;
      const quality=/^(Caption is too short|Caption does not use|Analysis does not use|Caption copies|Incomplete model JSON|Invalid AI caption|Empty model output)/.test(e.message||'');
      const reason=e instanceof WebsiteError||e instanceof SemanticError?e.message:e instanceof HttpError?e.message:quality?`${e.message}. Review the local model output or try a stronger model; no post was sent.`:'Pre-publish processing failed; verify endpoint, model and credentials';
      const retryAt=new Date(Date.now()+Math.min(3600,60*2**attempts)*1000);
      await update(a.id, { status: attempts >= 5 ? 'Failed' : a.status, attempts, next_attempt_at:retryAt, last_error:reason });
      return { page:page.id,failed: a.id,error:reason,retryAt:retryAt.toISOString() };
    }
  }))));
  return { pages: results,...(!pages.length?{blocked:true,reason:'No enabled pages'}:results.every(r=>r.empty||r.queued)?{blocked:true,reason:results.map(r=>r.reason||r.queued).join('; ')}:{}) };
}
export async function mirror() {
  return locked('mirror', async () => {
    await reportProgress(0,2,'Writing Google Sheets log');
    const sheets=await syncSheet();
    await reportProgress(1,2,'Updating Airtable records','Google Sheets stage completed; saving content statuses and media');
    const rows = (await query('SELECT a.*,a.vector IS NOT NULL AS has_vector,a.updated_at::text AS version,c.status AS comment_status,c.remote_id AS comment_id,c.due_at AS comment_due,c.last_error AS comment_error FROM echolink.articles a LEFT JOIN echolink.source_comments c ON c.article_id=a.id WHERE a.dirty=true ORDER BY a.updated_at LIMIT 50')).rows;
    for (const a of rows) {
      const response = await airtable(tables().log, { method: 'PATCH', body: { performUpsert: { fieldsToMergeOn: ['Automation ID'] }, records: [{ fields: {
        'Log ID': a.id, 'Automation ID': a.id, 'Article Hash ID': a.url_hash, 'Semantic Vector ID': a.has_vector ? a.id : '', 'Linked Page': [a.page_id], 'Source Title': a.title, 'Source URL': a.source_url,
        'Extracted Text Content': a.body, 'AI Generated Caption': a.caption || '', 'Media Attachment URLs': a.image_url || '', Status: a.status,
        'FB Post ID Reference': a.fb_post_id || '', 'Timestamp Published': a.published_at?.toISOString() || null,
        'Website Article URL':a.website_url||'','Website Post ID':a.website_post_id||'','Website Status':a.website_status||null,
        'Outcome Detail':[a.last_error,a.comment_error].filter(Boolean).join('\n'),
        ...(process.env.AIRTABLE_LOG_TIMESTAMP_WRITABLE === 'true' ? { 'Timestamp Logged': a.created_at.toISOString() } : {}),
        'Source Comment Status':a.comment_status||null,'Source Comment ID':a.comment_id||'', 'Source Comment Due At':a.comment_due?.toISOString()||null,
        'Source Published At':a.source_published_at?.toISOString()||null,'Scheduled At':a.scheduled_at?.toISOString()||null,'Editorial Analysis':a.analysis||'','Image Suggestion':a.image_prompt||'','Selection Score':a.selection_score??null,'Selection Reason':a.selection_reason||'','Dashboard Panel':contentPanel(a),
      } }] } });
      const id = response.records[0].id;
      await query('UPDATE echolink.articles SET airtable_id=$2,dirty=false WHERE id=$1 AND updated_at=$3::timestamptz', [a.id, id, a.version]);
    }
    const events=(await query('SELECT id,page_id,title,source_url,status,detail,created_at FROM echolink.ingestion_events WHERE dirty=true ORDER BY created_at LIMIT 50')).rows;
    for(const event of events){
      const result=await airtable(tables().log,{method:'PATCH',body:{performUpsert:{fieldsToMergeOn:['Automation ID']},records:[{fields:{'Log ID':event.id,'Automation ID':event.id,'Linked Page':[event.page_id],'Source Title':event.title,'Source URL':event.source_url,Status:event.status,'Outcome Detail':event.detail,...(process.env.AIRTABLE_LOG_TIMESTAMP_WRITABLE==='true'?{'Timestamp Logged':event.created_at.toISOString()}:{})}}]}});
      await query('UPDATE echolink.ingestion_events SET dirty=false,airtable_id=$2 WHERE id=$1',[event.id,result.records[0].id]);
    }
    return { mirrored: rows.length, auditEvents:events.length,sheets };
  });
}
export async function approvals() {
  return locked('approvals', async () => {
    const pending = (await query("SELECT id,airtable_id,caption_hash,notified_at FROM echolink.articles WHERE status='Pending Approval' AND airtable_id IS NOT NULL ORDER BY created_at LIMIT 30")).rows;
    let approved = 0,checked=0;
    for (const a of pending) {
      await reportProgress(checked++,Math.max(1,pending.length),'Reading editorial decisions',`${checked-1}/${pending.length} review records checked`);
      const record = await airtable(tables().log, { params: { filterByFormula: `RECORD_ID()='${a.airtable_id}'`, maxRecords: '1' } });
      const f = record.records[0]?.fields;
      if (!f) continue;
      if (f['Approval Decision'] === 'Rejected') { await update(a.id, { status: 'Rejected' }); continue; }
      if (f['Approval Decision'] === 'Approved' && hash(f['AI Generated Caption'] || '') === a.caption_hash) {
        await update(a.id, { status: 'Approved', approval_hash: a.caption_hash }); approved++; continue;
      }
      if (!a.notified_at && process.env.APPROVAL_NOTIFICATION_URL) {
        // Reserve notification before sending: ambiguous webhook results are not retried automatically.
        await update(a.id, { notified_at: new Date() });
        const link = `https://airtable.com/${process.env.AIRTABLE_BASE_ID}/${a.airtable_id}`;
        await jsonRequest(process.env.APPROVAL_NOTIFICATION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `EchoLink approval required: ${link}` }) }, { hosts: ['hooks.slack.com'] }).catch(() => {});
      }
    }
    return { checked: pending.length, approved };
  });
}
export async function analytics() {
  return locked('analytics', async () => {
    if (dryRun()) return { skipped: 'dry run' };
    const pages = new Map((await settings('page')).map(r => [r.id, r.config]));
    const posts = (await query("SELECT a.id,a.page_id,a.fb_post_id FROM echolink.articles a LEFT JOIN echolink.analytics m ON a.id=m.article_id WHERE a.status='Posted' AND a.published_at>now()-interval '7 days' AND (m.collected_at IS NULL OR m.collected_at<now()-interval '6 hours') ORDER BY a.published_at DESC LIMIT 20")).rows;
    let collected = 0,checked=0;
    for (const a of posts) {
      await reportProgress(checked++,Math.max(1,posts.length),'Collecting Facebook engagement',`${checked-1}/${posts.length} posts checked`);
      const p = pages.get(a.page_id); if (!p?.active||!(await deliveryGate(p.id)).ready) continue;
      try {
        const url = new URL(`${graphBase()}/${encodeURIComponent(a.fb_post_id)}`);
        url.searchParams.set('fields', 'shares,comments.limit(0).summary(true),reactions.limit(0).summary(true)');
        const metrics = await graphRequest(p.id,url, { headers: bearer(tokens('FB_TOKENS_JSON')[p.fbSecret]) }, { hosts: ['graph.facebook.com'] });
        await query('INSERT INTO echolink.analytics(article_id,metrics) VALUES($1,$2) ON CONFLICT(article_id) DO UPDATE SET metrics=excluded.metrics,collected_at=now()', [a.id, JSON.stringify(metrics)]);
        collected++;
      } catch { /* Permissions and fields differ by page; retry next scheduled run. */ }
    }
    return { collected };
  });
}
export async function comments(options={}) {
  return locked('comments', async () => {
    if(!automaticLinksEnabled()){
      const skipped=await query("WITH cancelled AS (UPDATE echolink.source_comments SET status='Skipped',last_error='Automatic Facebook links disabled by owner',updated_at=now() WHERE status='Queued' RETURNING article_id) UPDATE echolink.articles SET dirty=true,updated_at=now() WHERE id IN (SELECT article_id FROM cancelled)");
      return {sent:0,skipped:skipped.rowCount,policyDisabled:true};
    }
    if (dryRun()) return { skipped: 'dry run' };
    await query("WITH stale AS (UPDATE echolink.source_comments SET status='Unknown',last_error='Reconcile remote comment before retrying',updated_at=now() WHERE status='Sending' AND updated_at<now()-interval '20 minutes' RETURNING article_id) UPDATE echolink.articles SET dirty=true,updated_at=now() WHERE id IN (SELECT article_id FROM stale)");
    const pages = new Map((await settings('page')).filter(r=>r.config.active).map(r=>[r.id,r.config]));
    const rows = (await query("SELECT DISTINCT ON(page_id) article_id,page_id,fb_post_id,message,due_at FROM echolink.source_comments WHERE status='Queued' AND due_at<=now() AND ($1::text IS NULL OR page_id=$1) ORDER BY page_id,due_at LIMIT 50",[options.pageId||null])).rows;
    let sent=0,failed=0,checked=0;
    for(const row of rows){const page=pages.get(row.page_id);if(!page||!sourceCommentReady(page,row.due_at,new Date(),dryRun()))continue;
      await reportProgress(checked++,Math.max(1,rows.length),'Checking and sending due source comments',`${sent} sent; ${failed} failed`);
      await locked(`page:${page.id}`,async()=>{
        if(!(await deliveryGate(page.id)).ready)return;
        const token=tokens('FB_TOKENS_JSON')[page.fbSecret];
        let base;
        try {if(!token)throw new Error('missing token');base=graphBase();}
        catch {
          await query("UPDATE echolink.source_comments SET status='Failed',last_error='Page token or Graph API version is missing; fix connection before retrying',updated_at=now() WHERE article_id=$1",[row.article_id]);
          await query('UPDATE echolink.articles SET dirty=true,updated_at=now() WHERE id=$1',[row.article_id]);
          failed++;return;
        }
        await query("UPDATE echolink.source_comments SET status='Sending',updated_at=now() WHERE article_id=$1",[row.article_id]);
        try{
          const result=await graphRequest(page.id,`${base}/${encodeURIComponent(row.fb_post_id)}/comments`,{method:'POST',headers:{'Content-Type':'application/json',...bearer(token)},body:JSON.stringify({message:row.message})},{hosts:['graph.facebook.com']});
          if(!result.id)throw new Error('No remote comment ID');
          await query("UPDATE echolink.source_comments SET status='Sent',remote_id=$2,updated_at=now() WHERE article_id=$1",[row.article_id,result.id]);sent++;
        }catch(e){
          if(e instanceof FacebookError&&e.rateLimited){await query("UPDATE echolink.source_comments SET status='Queued',due_at=now()+($2::double precision*interval '1 second'),last_error='Facebook rate limit; awaiting cooldown',updated_at=now() WHERE article_id=$1",[row.article_id,e.retryAfter]);await query('UPDATE echolink.articles SET dirty=true,updated_at=now() WHERE id=$1',[row.article_id]);failed++;return;}
          const definite=e instanceof HttpError&&e.status>=400&&e.status<500&&![408,429].includes(e.status);
          await query('UPDATE echolink.source_comments SET status=$2,last_error=$3,updated_at=now() WHERE article_id=$1',[row.article_id,definite?'Failed':'Unknown',definite?(e instanceof FacebookError?e.diagnostic:`Facebook rejected source comment (HTTP ${e.status}); fix permissions or token before retrying`):'Inspect Facebook before retrying; comment delivery may have succeeded']);failed++;
        }
        await query('UPDATE echolink.articles SET dirty=true,updated_at=now() WHERE id=$1',[row.article_id]);
      });
    }
    return {sent,failed};
  });
}
export const jobs = { sync, ingest, process: processQueue, mirror, approvals, analytics, comments };
