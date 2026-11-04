import '../src/env.mjs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.DASHBOARD_PUBLIC_ORIGIN;
if(!base?.startsWith('https://'))throw new Error('Configure DASHBOARD_PUBLIC_ORIGIN');
const denied=await fetch(process.env.WORKER_ORIGIN+'/admin/api/auth');
assert.equal(denied.status,401,'Tunnel must reject requests without bridge authentication');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto(base+'/admin');
  await page.getByLabel('password',{exact:true}).fill(process.env.DASHBOARD_PASSWORD);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('heading',{name:"Today's top story → your draft"}).waitFor({timeout:60000});
  const response=await page.request.get(base+'/admin/api/state');
  assert.equal(response.status(),200);
  const state=await response.json();assert.ok(state.pages?.length);assert.ok(state.feeds?.length);
  const cookies=await page.context().cookies();
  assert.ok(cookies.some(cookie=>cookie.secure&&cookie.httpOnly),'Expected secure HttpOnly login cookie');
  for(const key of ['DASHBOARD_PASSWORD','WORKER_API_KEY','WORKER_BRIDGE_TOKEN','AIRTABLE_TOKEN','DATABASE_URL'])if(process.env[key])assert.ok(!JSON.stringify(state).includes(process.env[key]),`Leaked ${key}`);
  await page.getByRole('button',{name:'Drafts',exact:true}).click();
  await page.getByRole('heading',{name:'Drafts',exact:true,level:2}).waitFor();
  await page.getByRole('button',{name:'Activity',exact:true}).click();
  await page.getByRole('heading',{name:'Run activity & results'}).waitFor();
  assert.deepEqual(errors,[]);
  console.log(`PASS public dashboard: ${base}; real password login, Secure/HttpOnly session, ${state.pages.length} page(s), ${state.feeds.length} feeds, Drafts and Activity; no browser errors or secrets exposed.`);
  console.log('PASS public tunnel: anonymous access rejected (HTTP 401).');
  if(process.argv.includes('--test-model')){
    const fields=state.pages.find(p=>p.fields['Active Status'])?.fields||state.pages[0].fields;
    const headers={Origin:base};
    const discovery=await page.request.post(base+'/admin/api/models',{headers,data:{endpoint:fields['Local Endpoint URL'],alias:fields['AI Secret Alias']||''},timeout:30000});
    assert.equal(discovery.status(),200);assert.ok((await discovery.json()).models.includes(fields['Model Identifier']));
    const started=Date.now();
    console.log('Testing configured local model through the public dashboard; no article or Facebook post will be created.');
    const response=await page.request.post(base+'/admin/api/test-model',{headers,data:{fields},timeout:260000});
    assert.equal(response.status(),200,`Model HTTP ${response.status()}`);
    const generated=await response.json();assert.ok(generated.caption?.length>20,'Expected real generated text');
    console.log(`PASS public AI: ${fields['Model Identifier']}; ${generated.caption.length} generated characters in ${Math.round((Date.now()-started)/1000)} seconds. Connectivity check only; factual accuracy is not certified.`);
  }
}catch(error){console.error(`FAIL public dashboard check: ${error.code||error.name}. No request headers or session values logged.`);process.exitCode=1;}
finally{await browser.close()}
