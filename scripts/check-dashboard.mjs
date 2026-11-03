import '../src/env.mjs';
const base='http://127.0.0.1:8787';
async function request(path,body,headers={}){return fetch(base+'/admin/api/'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',Origin:base}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});}
const issued=await request('ticket',{}, {Authorization:'Bearer '+process.env.WORKER_API_KEY});
if(!issued.ok)throw new Error('Ticket request failed');
const ticket=(await issued.json()).ticket;
const accepted=await request('session',{ticket});
if(!accepted.ok)throw new Error('Session creation failed');
const cookie=accepted.headers.get('set-cookie').split(';')[0];
const response=await request('state',undefined,{Cookie:cookie});
const state=await response.json();
if(!response.ok||!state.pages||!state.feeds)throw new Error('Dashboard state failed');
if(JSON.stringify(state).includes(process.env.WORKER_API_KEY))throw new Error('Worker secret leaked');
for(const key of ['N8N_API_KEY','AIRTABLE_TOKEN','DATABASE_URL','DATABASE_URL_UNPOOLED','DASHBOARD_PASSWORD_HASH','DASHBOARD_PASSWORD','GOOGLE_SERVICE_ACCOUNT_JSON'])if(process.env[key]&&JSON.stringify(state).includes(process.env[key]))throw new Error('Secret leaked: '+key);
const fbSecrets=Object.values(JSON.parse(process.env.FB_TOKENS_JSON||'{}'));
if(fbSecrets.some(token=>JSON.stringify(state).includes(token)))throw new Error('Facebook secret leaked');
console.log(`PASS dashboard: authenticated session; ${state.pages.length} pages; ${state.feeds.length} feeds; dryRun=${state.dryRun}; no token values exposed.`);
const replay=await request('session',{ticket});if(replay.status!==401)throw new Error('Login ticket replay accepted');
console.log('PASS dashboard: login ticket cannot be reused.');
