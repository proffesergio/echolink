import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { authorized, normalizePage, hash } from './core.mjs';
import { allRecords, airtable, tables } from './airtable.mjs';
import { query,resetPools } from './db.mjs';
import { jsonRequest, hostList } from './net.mjs';
import { saveSettings } from './settings.mjs';
import { sync, mirror, approvals, jobs } from './jobs.mjs';
import {passwordHash,authenticatePassword,passwordConfigured,passwordSource,issueSession,validSession,sessionCookie,readSession} from './admin-auth.mjs';
import {publicConfiguration,jobNames} from './runtime.mjs';
import {planTick} from './scheduler.mjs';
import {workflowStatus,controlWorkflow} from './workflow-control.mjs';
import {runJob} from './telemetry.mjs';
import {contentPanel,generationResult} from './newsroom.mjs';
import {startPreview,enableBanglaFeeds,editDraft,articleAction,ContentActionError} from './newsroom-actions.mjs';
import {integrationCatalog} from './integrations.mjs';
import {validateGoogleCredentials,testSheet,syncSheet} from './sheets.mjs';
const tickets = new Map();
let loginFailures=0,loginResetAt=0;
let editorialMirror=Promise.resolve();
function queueEditorialMirror(){editorialMirror=editorialMirror.catch(()=>{}).then(()=>runJob('mirror',mirror,'editorial')).catch(()=>{});}
const reply = (value, status = 200, headers = {}) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
const pageFields = ['Page ID','FB Page Name','FB Page ID','Target Language','AI Infrastructure Target','Local Endpoint URL','Model Identifier','Temperature','Posting Window Start','Posting Window End','Max Posts Per Day','Require Human Approval','Active Status','Timezone','AI Secret Alias','FB Secret Alias','Source Comment Delay Minutes','Minimum Minutes Between Posts'];
const feedFields = ['Feed ID','Feed Name','Linked Page','RSS / Scraper URL','Fallback URL','Active Status'];
const pick = (obj, names) => Object.fromEntries(Object.entries(obj).filter(([k]) => names.includes(k)));
const maps = name => {try{const value=JSON.parse(process.env[name]||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}};
const validId = id => /^rec[A-Za-z0-9]+$/.test(id);
const publicOrigin=()=>{try{const u=new URL(process.env.DASHBOARD_PUBLIC_ORIGIN);return u.protocol==='https:'&&u.origin===process.env.DASHBOARD_PUBLIC_ORIGIN?u.origin:null;}catch{return null;}};
const origins = () => [`http://127.0.0.1:${process.env.PORT || 8787}`, `http://localhost:${process.env.PORT || 8787}`,publicOrigin()].filter(Boolean);
const loginCookie=req=>sessionCookie(issueSession(),!!publicOrigin()&&req.headers.get('origin')===publicOrigin());
function prune() {
  for (const [key, expires] of tickets) if (expires < Date.now()) tickets.delete(key);
}
export async function admin(req) {
  const url = new URL(req.url), path = url.pathname;
  if (!path.startsWith('/admin')) return null;
  prune();
  if(path==='/admin/api/auth'&&req.method==='GET')return reply({authenticated:validSession(readSession(req)),passwordConfigured:passwordConfigured()});
  const assets = { '/admin': ['index.html','text/html'], '/admin/': ['index.html','text/html'], '/admin/app.js': ['app.js','text/javascript'], '/admin/cms.js':['cms.js','text/javascript'], '/admin/style.css': ['style.css','text/css'] };
  if (req.method === 'GET' && assets[path]) {
    const [file, mime] = assets[path];
    return new Response(await readFile(new URL(`./ui/${file}`, import.meta.url)), { headers: { 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; frame-ancestors 'none'; base-uri 'none'", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
  }
  if (path === '/admin/api/ticket' && req.method === 'POST') {
    if (!authorized(req.headers.get('authorization'), process.env.WORKER_API_KEY)) return reply({ error: 'Unauthorized' }, 401);
    if (tickets.size > 20) return reply({ error: 'Too many login tickets' }, 429);
    const ticket = randomBytes(32).toString('hex'); tickets.set(ticket, Date.now() + 120000);
    return reply({ ticket });
  }
  if (req.method !== 'GET' && !origins().includes(req.headers.get('origin'))) return reply({ error: 'Local origin required' }, 403);
  if(path==='/admin/api/login'&&req.method==='POST'){
    if(!passwordConfigured())return reply({error:'Set DASHBOARD_PASSWORD in .env.local and restart the worker, or run npm run dashboard once to create a password in Settings.'},409);
    if(Date.now()>loginResetAt){loginFailures=0;loginResetAt=Date.now()+5*60000;}
    if(loginFailures>=5)return reply({error:'Too many login attempts. Try again in five minutes, or use npm run dashboard.'},429);
    const {password}=await req.json();
    if(!await authenticatePassword(password)){loginFailures++;return reply({error:'Incorrect dashboard password'},401);}
    loginFailures=0;
    return reply({ok:true},200,{'Set-Cookie':loginCookie(req)});
  }
  if (path === '/admin/api/session' && req.method === 'POST') {
    const { ticket } = await req.json();
    if (!tickets.has(ticket)) return reply({ error: 'Login link expired. Run npm run dashboard again.' }, 401);
    tickets.delete(ticket);
    return reply({ ok: true }, 200, { 'Set-Cookie': loginCookie(req) });
  }
  if (!validSession(readSession(req))) return reply({ error: 'Sign in to the dashboard. Owner recovery is available with npm run dashboard.' }, 401);
  try {
    if(path==='/admin/api/logout'&&req.method==='POST')return reply({ok:true},200,{'Set-Cookie':'echolink_admin=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0'});
    if(path==='/admin/api/password'&&req.method==='POST'){
      const {password}=await req.json();
      await saveSettings({DASHBOARD_PASSWORD:'',DASHBOARD_PASSWORD_HASH:await passwordHash(password)});
      return reply({ok:true},200,{'Set-Cookie':loginCookie(req)});
    }
    if(path==='/admin/api/configuration'&&req.method==='GET')return reply({...publicConfiguration(),facebookAliases:Object.keys(maps('FB_TOKENS_JSON')),aiAliases:Object.keys(maps('AI_TOKENS_JSON')),graphVersion:process.env.META_GRAPH_VERSION||'',workflow:workflowStatus()});
    if(path==='/admin/api/preview'&&req.method==='POST'){const {pageId}=await req.json();return reply(await startPreview(pageId),202);}
    if(path==='/admin/api/enable-feeds'&&req.method==='POST'){const {pageId,confirmed}=await req.json();if(confirmed!==true)return reply({error:'Confirm enabling the verified Bangla catalog'},400);return reply(await enableBanglaFeeds(pageId));}
    if(path==='/admin/api/draft'&&req.method==='POST'){const {id,...body}=await req.json();const result=await editDraft(id,body);queueEditorialMirror();return reply(result);}
    if(path==='/admin/api/sheets'&&req.method==='POST'){
      const body=await req.json(),values={};
      if(body.spreadsheetId!==undefined){const id=String(body.spreadsheetId).match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)?.[1]||String(body.spreadsheetId).trim();if(!/^[A-Za-z0-9_-]{15,200}$/.test(id))return reply({error:'Enter a spreadsheet URL or ID'},400);values.GOOGLE_SHEET_ID=id;}
      if(body.tab!==undefined){if(!String(body.tab).trim()||String(body.tab).length>80||/[\[\]*?:/\\]/.test(body.tab))return reply({error:'Use a simple dedicated sheet tab name'},400);values.GOOGLE_SHEET_TAB=String(body.tab).trim();}
      if(body.credentials)values.GOOGLE_SERVICE_ACCOUNT_JSON=JSON.stringify(validateGoogleCredentials(body.credentials));
      await saveSettings(values);return reply({ok:true,googleSheets:publicConfiguration().googleSheets});
    }
    if(path==='/admin/api/test-sheets'&&req.method==='POST')return reply(await testSheet());
    if(path==='/admin/api/sync-sheets'&&req.method==='POST')return reply({ok:true,result:await runJob('sheets',syncSheet,'dashboard')});
    if(path==='/admin/api/workflow'&&req.method==='POST'){
      const {action,confirmed}=await req.json();
      if(confirmed!==true||!['start','stop'].includes(action))return reply({error:'Confirm Start or Stop before changing the workflow'},400);
      return reply({ok:true,workflow:await controlWorkflow(action)});
    }
    if(path==='/admin/api/test-database'&&req.method==='POST'){
      const result=await query("SELECT to_regclass('echolink.articles') IS NOT NULL AS articles,to_regclass('echolink.job_schedule') IS NOT NULL AS scheduler");
      return reply({ok:true,schema:result.rows[0]});
    }
    if(path==='/admin/api/test-airtable'&&req.method==='POST')return reply({ok:true,pages:(await allRecords(tables().pages)).length,feeds:(await allRecords(tables().feeds)).length});
    if(path==='/admin/api/settings'&&req.method==='POST'){
      const body=await req.json(),values={};
      if(body.n8nAPIKey)values.N8N_API_KEY=String(body.n8nAPIKey);
      const numeric={pageConcurrency:['PAGE_CONCURRENCY',1,3],feedConcurrency:['FEED_CONCURRENCY',1,8],maxItemsPerFeed:['MAX_ITEMS_PER_FEED',1,25],aiTimeoutMs:['AI_TIMEOUT_MS',1000,600000],articleTimeoutMs:['ARTICLE_TIMEOUT_MS',1000,600000],semanticTTLDays:['SEMANTIC_TTL_DAYS',1,30]};
      for(const [key,[env,min,max]]of Object.entries(numeric))if(body[key]!==undefined){const value=Number(body[key]);if(!Number.isInteger(value)||value<min||value>max)return reply({error:`${key} must be an integer from ${min} to ${max}`},400);values[env]=String(value);}
      if(body.semanticThreshold!==undefined){const value=Number(body.semanticThreshold);if(!(value>0&&value<=1))return reply({error:'Semantic threshold must be between 0 and 1'},400);values.SEMANTIC_THRESHOLD=String(value);}
      for(const [key,env]of [['allowedAIHosts','ALLOWED_AI_HOSTS'],['sourceHosts','ALLOWED_SOURCE_HOSTS']])if(body[key]!==undefined){const list=String(body[key]).split(',').map(s=>s.trim()).filter(Boolean);if(!list.length||list.some(s=>!/^[a-zA-Z0-9.:-]+$/.test(s)))return reply({error:`${key} must contain comma-separated hostnames`},400);values[env]=[...new Set(list)].join(',');}
      for(const [key,env]of [['embeddingURL','EMBEDDING_URL'],['embeddingModel','EMBEDDING_MODEL']])if(body[key]!==undefined)values[env]=String(body[key]).trim();
      if(values.EMBEDDING_URL){const u=new URL(values.EMBEDDING_URL);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return reply({error:'Invalid embedding endpoint'},400);}
      if(body.embeddingToken)values.EMBEDDING_TOKEN=String(body.embeddingToken);
      if(body.semanticEnabled!==undefined){if(typeof body.semanticEnabled!=='boolean')return reply({error:'Invalid semantic mode'},400);values.SEMANTIC_ENABLED=String(body.semanticEnabled);}
      if(body.airtableBaseId!==undefined){if(!/^app[A-Za-z0-9]+$/.test(body.airtableBaseId))return reply({error:'Use the Airtable base ID beginning with app'},400);values.AIRTABLE_BASE_ID=body.airtableBaseId;}
      if(body.airtableToken)values.AIRTABLE_TOKEN=String(body.airtableToken);
      let databaseChanged=false;
      for(const [key,env]of [['databaseURL','DATABASE_URL'],['directDatabaseURL','DATABASE_URL_UNPOOLED']])if(body[key]){const u=new URL(body[key]);if(!['postgres:','postgresql:'].includes(u.protocol))return reply({error:'Use a PostgreSQL connection URL'},400);values[env]=String(body[key]);databaseChanged=true;}
      if(databaseChanged){const {default:pg}=await import('pg');const client=new pg.Client({connectionString:values.DATABASE_URL||process.env.DATABASE_URL,connectionTimeoutMillis:10000});try{await client.connect();await client.query('SELECT 1');}finally{await client.end();}}
      if(body.intervals)for(const job of jobNames)if(body.intervals[job]!==undefined){const value=Number(body.intervals[job]);if(!Number.isInteger(value)||value<1||value>1440)return reply({error:`${job} interval must be 1–1440 minutes`},400);values[`${job.toUpperCase()}_INTERVAL_MINUTES`]=String(value);}
      if(body.dryRun!==undefined){
        if(typeof body.dryRun!=='boolean')return reply({error:'Invalid publishing mode'},400);
        if(!body.dryRun&&process.env.DRY_RUN!=='false'){
          if(body.liveConfirmation!=='ENABLE LIVE PUBLISHING')return reply({error:'Type ENABLE LIVE PUBLISHING to authorize live mode'},400);
          const active=(await allRecords(tables().pages)).map(normalizePage).filter(p=>p.active);
          if(!active.length||active.some(p=>!p.fbPageId||p.fbPageId==='0'||!maps('FB_TOKENS_JSON')[p.fbSecret])||!/^v\d+\.\d+$/.test(process.env.META_GRAPH_VERSION||''))return reply({error:'Configure at least one enabled real Page with a saved token and Graph API version before enabling live mode'},409);
        }
        values.DRY_RUN=String(body.dryRun);
      }
      await saveSettings(values);if(databaseChanged)await resetPools();
      return reply({ok:true,configuration:publicConfiguration()});
    }
    if (path === '/admin/api/state' && req.method === 'GET') {
      const names=['pages','feeds','articles','counts','audit','scheduler','runs'];
      const results = await Promise.allSettled([
        allRecords(tables().pages), allRecords(tables().feeds),
        query('SELECT a.id,a.page_id,a.title,a.source_url,a.image_url,a.caption,a.status,a.fb_post_id,a.last_error,a.created_at,a.updated_at,a.source_published_at,a.publisher,a.selection_score,a.selection_reason,a.analysis,a.image_prompt,a.scheduled_at,a.published_at,c.status AS comment_status,c.due_at AS comment_due,c.remote_id AS comment_id FROM echolink.articles a LEFT JOIN echolink.source_comments c ON c.article_id=a.id ORDER BY (a.caption IS NOT NULL) DESC,a.updated_at DESC LIMIT 200'),
        query('SELECT status,count(*)::int AS count,count(*) FILTER (WHERE caption IS NOT NULL)::int AS caption_count FROM echolink.articles GROUP BY status'),
        query('SELECT id,page_id,title,source_url,status,detail,occurrences,created_at FROM echolink.ingestion_events ORDER BY updated_at DESC LIMIT 50'),
        planTick(),
        query("SELECT id,job,trigger_source,status,started_at,finished_at,result,error FROM echolink.job_runs WHERE id IN (SELECT id FROM echolink.job_runs ORDER BY started_at DESC LIMIT 50) OR id=(SELECT id FROM echolink.job_runs WHERE job='preview' ORDER BY started_at DESC LIMIT 1) ORDER BY started_at DESC"),
      ]);
      const errors={};results.forEach((result,index)=>{if(result.status==='rejected')errors[names[index]]=result.reason?.status?`Upstream HTTP ${result.reason.status}; check connection and permissions`:'Connection unavailable; check Settings and local logs';});
      const data=index=>results[index].status==='fulfilled'?results[index].value:null;
      const pages=data(0)||[],feeds=data(1)||[],active=pages.filter(p=>p.fields['Active Status']),issues=[];
      if(!active.length)issues.push({level:'warning',message:'No enabled Page. Configure and enable a Page under Pages & models.'});
      for(const p of active){
        if(!feeds.some(f=>f.fields['Active Status']&&(f.fields['Linked Page']||[]).includes(p.id)))issues.push({level:'warning',pageId:p.id,message:`${p.fields['FB Page Name']}: no enabled feeds are linked. Ingestion will return zero articles.`});
        if(!p.fields['Model Identifier'])issues.push({level:'warning',pageId:p.id,message:'Choose an installed AI model for this Page.'});
        if(!maps('FB_TOKENS_JSON')[p.fields['FB Secret Alias']||p.id])issues.push({level:'warning',pageId:p.id,message:`${p.fields['FB Page Name']}: no saved Page token matches its FB Secret Alias. Dry-run drafting works; live publishing is blocked.`});
      }
      const counts=data(3)?.rows||[],count=status=>counts.find(c=>c.status===status)?.count||0;
      const navCounts={queue:count('Pending Approval'),drafts:counts.filter(c=>['Draft','Pending Approval','Dry Run','Queued'].includes(c.status)).reduce((sum,c)=>sum+c.caption_count,0),scheduled:count('Approved'),published:count('Posted'),inbox:count('Queued')-(counts.find(c=>c.status==='Queued')?.caption_count||0),total:counts.reduce((sum,c)=>sum+c.count,0)};
      const configuration=publicConfiguration();
      return reply({ pages: pages.map(p => ({ id: p.id, fields: pick(p.fields, pageFields) })), feeds, articles:(data(2)?.rows||[]).map(a=>({...a,panel:contentPanel(a)})), counts,navCounts,integrations:integrationCatalog(pages,configuration), audit:data(4)?.rows||[],scheduler:data(5),runs:data(6)?.rows||[],readiness:issues,serviceErrors:errors,configuration,workflow:workflowStatus(),
        dryRun: process.env.DRY_RUN !== 'false', facebookAliases: Object.keys(maps('FB_TOKENS_JSON')), aiAliases: Object.keys(maps('AI_TOKENS_JSON')),
        graphVersion: process.env.META_GRAPH_VERSION || '', sourceHosts: process.env.ALLOWED_SOURCE_HOSTS || '',
      });
    }
    if (path === '/admin/api/page' && req.method === 'POST') {
      const { id, fields } = await req.json();
      if (id && !validId(id)) return reply({ error: 'Invalid page record' }, 400);
      const data = pick(fields, pageFields);
      if (!String(data['FB Page Name'] || '').trim()) return reply({ error: 'Page name required' }, 400);
      normalizePage({ id: id || 'new', fields: data });
      if (data['Local Endpoint URL']) {
        const endpoint = new URL(data['Local Endpoint URL']);
        if (!['http:', 'https:'].includes(endpoint.protocol) || !hostList('ALLOWED_AI_HOSTS').includes(endpoint.hostname)) return reply({ error: 'Model host must be allowed in ALLOWED_AI_HOSTS' }, 400);
      }
      if (!id) data['Page ID'] ||= randomBytes(6).toString('hex');
      const saved=await airtable(tables().pages, { method: id ? 'PATCH' : 'POST', body: { records: [{ ...(id ? { id } : {}), fields: data }] } });
      await sync(); return reply({ ok: true, id:saved.records[0].id });
    }
    if (path === '/admin/api/feed' && req.method === 'POST') {
      const { id, fields } = await req.json();
      if (id && !validId(id)) return reply({ error: 'Invalid feed record' }, 400);
      const data = pick(fields, feedFields);
      for (const field of ['RSS / Scraper URL','Fallback URL']) if (data[field]) {
        const u = new URL(data[field]);
        if (u.protocol !== 'https:' || !hostList('ALLOWED_SOURCE_HOSTS').includes(u.hostname)) return reply({ error: 'Use an HTTPS feed URL and add its hostname under Source hosts first' }, 400);
      }
      if (!data['Feed Name'] || !data['RSS / Scraper URL'] || !data['Linked Page']?.length || !data['Linked Page'].every(validId)) return reply({ error: 'Feed needs a name, URL and linked page' }, 400);
      if (!id) data['Feed ID'] ||= randomBytes(6).toString('hex');
      const saved=await airtable(tables().feeds, { method: id ? 'PATCH' : 'POST', body: { records: [{ ...(id ? { id } : {}), fields: data }] } });
      await sync(); return reply({ ok: true, id:saved.records[0].id });
    }
    if (path === '/admin/api/secret' && req.method === 'POST') {
      const { kind, alias, value, graphVersion } = await req.json();
      if (!['facebook','ai'].includes(kind) || !/^[a-zA-Z0-9_-]{1,64}$/.test(alias) || typeof value !== 'string' || value.length < 8 || value.length > 10000) return reply({ error: 'Provide an alias and token' }, 400);
      if (kind === 'facebook' && !/^v\d+\.\d+$/.test(graphVersion || '')) return reply({ error: 'Enter a Graph API version from your Meta app, e.g. vNN.0' }, 400);
      const key = kind === 'facebook' ? 'FB_TOKENS_JSON' : 'AI_TOKENS_JSON';
      const settings = { [key]: JSON.stringify({ ...maps(key), [alias]: value }) };
      if (kind === 'facebook') settings.META_GRAPH_VERSION = graphVersion;
      await saveSettings(settings); return reply({ ok: true });
    }
    if (path === '/admin/api/hosts' && req.method === 'POST') {
      const { hosts } = await req.json();
      const list = String(hosts).split(',').map(s => s.trim()).filter(Boolean);
      if (!list.length || list.some(s => !/^[a-zA-Z0-9.-]+$/.test(s) || s.includes('..'))) return reply({ error: 'Use comma-separated hostnames without paths or protocols' }, 400);
      await saveSettings({ ALLOWED_SOURCE_HOSTS: [...new Set(list)].join(',') }); return reply({ ok: true });
    }
    if (path === '/admin/api/models' && req.method === 'POST') {
      const { endpoint, alias = '' } = await req.json();
      const url = new URL(endpoint); url.pathname = url.pathname.replace(/\/chat\/completions\/?$/, '/models');
      const secret = maps('AI_TOKENS_JSON')[alias];
      const data = await jsonRequest(url, { headers: secret ? { Authorization: `Bearer ${secret}` } : {} }, { hosts: hostList('ALLOWED_AI_HOSTS'), local: true });
      return reply({ models: (data.data || []).map(m => m.id) });
    }
    if (path === '/admin/api/test-model' && req.method === 'POST') {
      const { fields } = await req.json(); const p = normalizePage({ id: 'test', fields: { ...fields, 'Active Status': false } });
      const secret = maps('AI_TOKENS_JSON')[p.aiSecret];
      // Keep diagnostics short enough for a public HTTP request. Full editorial
      // generation runs in the durable background preview instead.
      const payload={model:p.model,temperature:p.temperature,stream:false,max_tokens:96,messages:[{role:'system',content:'This is a connection diagnostic. Reply with exactly one short sentence in '+(p.language==='Bangla'?'Bangla':'English')+'. Do not add analysis or JSON.'},{role:'user',content:'Say that the local AI model connection is working. This is a test, not a news story.'}]};
      const data = await jsonRequest(p.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(secret ? { Authorization: `Bearer ${secret}` } : {}) }, body: JSON.stringify(payload) }, { hosts: hostList('ALLOWED_AI_HOSTS'), local: true, timeoutMs: Math.min(Number(process.env.AI_TIMEOUT_MS || 300000),100000) });
      return reply(generationResult(data.choices?.[0]?.message?.content));
    }
    if(path==='/admin/api/article-action'&&req.method==='POST'){
      const body=await req.json();const result=await articleAction(body.id,body.action,body);if(!['publish','generate'].includes(body.action))queueEditorialMirror();return reply(result,202);
    }
    if (path === '/admin/api/test-facebook' && req.method === 'POST') {
      const { alias, pageId } = await req.json(), secret = maps('FB_TOKENS_JSON')[alias], version = process.env.META_GRAPH_VERSION;
      if(!/^\d+$/.test(pageId||''))return reply({error:'Enter the numeric Facebook Page ID under Pages & models. Use the id returned by GET /me/accounts, not the app ID or Page username'},400);
      if(!secret)return reply({error:`No Page token is saved for alias “${alias||'(empty)'}”. Open Connections → Facebook Page token, save it under that alias, then retry`},400);
      if(!/^v\d+\.\d+$/.test(version||''))return reply({error:'Save graphVersion in Connections → Facebook Page token using the version selected in Graph API Explorer (format vNN.N)'},400);
      const identity = await jsonRequest(`https://graph.facebook.com/${version}/me?fields=id,name`, { headers: { Authorization: `Bearer ${secret}` } }, { hosts: ['graph.facebook.com'] });
      if (String(identity.id) !== pageId) return reply({ error: 'This token does not identify the selected Page; use a Page access token' }, 400);
      return reply({ ok: true, name: identity.name, id: identity.id });
    }
    if (path === '/admin/api/decision' && req.method === 'POST') {
      const { id, decision } = await req.json();
      if (!['Approved','Rejected'].includes(decision)) return reply({ error: 'Invalid decision' }, 400);
      const row = (await query("SELECT airtable_id,caption,caption_hash FROM echolink.articles WHERE id=$1 AND status='Pending Approval'", [id])).rows[0];
      if (!row?.airtable_id || hash(row.caption || '') !== row.caption_hash) return reply({ error: 'Mirror the pending article first; its content must match the review record' }, 409);
      await airtable(tables().log, { method: 'PATCH', body: { records: [{ id: row.airtable_id, fields: { 'Approval Decision': decision } }] } });
      await approvals(); await mirror(); return reply({ ok: true });
    }
    if(path==='/admin/api/retry'&&req.method==='POST'){
      const {id,target,confirmed}=await req.json();
      if(confirmed!==true||!['article','comment'].includes(target))return reply({error:'Confirm the retry before submitting'},400);
      let result;
      if(target==='article')result=await query("UPDATE echolink.articles SET status='Queued',approval_hash=NULL,attempts=0,next_attempt_at=now(),last_error=NULL,dirty=true,updated_at=now() WHERE id=$1 AND status IN ('Failed','Dry Run') RETURNING id",[id]);
      else{
        result=await query("UPDATE echolink.source_comments SET status='Queued',last_error=NULL,due_at=GREATEST(due_at,now()),updated_at=now() WHERE article_id=$1 AND status='Failed' RETURNING article_id",[id]);
        if(result.rowCount)await query('UPDATE echolink.articles SET dirty=true,updated_at=now() WHERE id=$1',[id]);
      }
      if(!result.rowCount)return reply({error:'Only failed pre-publication/dry-run articles or definitively failed comments can be retried here. Unknown remote outcomes require reconciliation.'},409);
      return reply({ok:true});
    }
    if (path === '/admin/api/job' && req.method === 'POST') {
      const { job } = await req.json();
      if (!Object.hasOwn(jobs, job)) return reply({ error: 'Unknown job' }, 400);
      if (process.env.DRY_RUN === 'false' && job === 'process') return reply({ error: 'Manual processing in this dashboard is restricted to dry-run mode. Use the configured n8n publishing workflow for live runs.' }, 409);
      return reply({ ok: true, result: await runJob(job,jobs[job],'dashboard') });
    }
    return reply({ error: 'Not found' }, 404);
  } catch (e) {
    if(e instanceof ContentActionError)return reply({error:e.message},e.status);
    console.error('Admin operation failed:', e.status || e.code || 'configuration/upstream');
    const fieldErrors=new Set(['Enable dry-run before generating a preview','Choose an enabled Page first','Choose a Page first','Review sync is running. Retry shortly','Only an unpublished draft can be edited','Page processing is running. Retry shortly','Article is no longer editable','Caption must contain 1–1800 characters','Use an HTTPS media URL','Choose a future scheduled time','Provide a Google service-account JSON key']);
    if(fieldErrors.has(e.message))return reply({error:e.message},400);
    if(e.message?.startsWith('Use a dashboard password')||e.message?.startsWith('Save an n8n API key')||e.message?.startsWith('n8n API rejected'))return reply({error:e.message},400);
    return reply({ error: e.status ? `Upstream HTTP ${e.status}; verify credentials, model and permissions.` : 'Operation failed. Check field values, service connectivity and local logs.' }, 400);
  }
}
