import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {randomBytes} from 'node:crypto';
import {parseEnv} from 'node:util';
import {createServer} from 'node:http';
const dir=await mkdtemp(join(tmpdir(),'echolink-auth-')),key=randomBytes(32).toString('hex');
const origin='http://127.0.0.1:18791',password='temporary environment password',newPassword='temporary UI created password';
let worker,browser,n8n;
try{
  n8n=createServer((req,res)=>{const valid=req.url==='/api/v1/workflows/echolinkPipeline01'&&req.headers['x-n8n-api-key']==='verified-test-key';res.writeHead(valid?200:401,{'Content-Type':'application/json'});res.end(JSON.stringify(valid?{id:'echolinkPipeline01'}:{error:'Invalid test key'}));});
  await new Promise(resolve=>n8n.listen(0,'127.0.0.1',resolve));const n8nBase='http://127.0.0.1:'+n8n.address().port;
  await writeFile(join(dir,'.env.local'),`WORKER_API_KEY=${key}\nDASHBOARD_PASSWORD='${password}'\nPORT=18791\nHOST=127.0.0.1\nDRY_RUN=true\nN8N_API_KEY=existing-test-key\nN8N_BASE_URL=${n8nBase}\n`);
  worker=spawn(process.execPath,[resolve('src/server.mjs')],{cwd:dir,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,WORKER_API_KEY:key,DASHBOARD_PASSWORD:password,DASHBOARD_PASSWORD_HASH:'',PORT:'18791',N8N_API_KEY:'existing-test-key',N8N_BASE_URL:n8nBase}});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Temporary worker startup timed out')),10000);worker.stdout.on('data',chunk=>{if(String(chunk).includes('listening')){clearTimeout(timer);resolve();}});worker.once('error',reject);});
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const configuration={dryRun:true,passwordConfigured:true,passwordSource:'environment',n8nAPIKeyConfigured:true,airtableBaseId:'appTest123',pageConcurrency:1,feedConcurrency:4,maxItemsPerFeed:5,aiTimeoutMs:300000,articleTimeoutMs:15000,semanticThreshold:0.95,semanticTTLDays:7,allowedAIHosts:'localhost',sourceHosts:'example.com',embeddingURL:'http://localhost:11434/v1/embeddings',embeddingModel:'test',intervals:{sync:15,ingest:10,approvals:1,process:2,comments:1,mirror:2,analytics:360}};
  // Only service-backed dashboard data is stubbed; login, password persistence,
  // session cookies, logout and password verification use the actual HTTP server.
  await page.route('**/admin/api/configuration',route=>route.fulfill({json:configuration}));
  await page.route('**/admin/api/state',route=>route.fulfill({json:{...configuration,pages:[],feeds:[],articles:[],counts:[],audit:[],facebookAliases:[],aiAliases:[],configuration}}));
  await page.goto(origin+'/admin');await page.getByLabel('password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('heading',{name:'One pipeline. Every page.'}).waitFor();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  const apiKey=page.getByLabel('n8nAPIKey',{exact:true});
  if(!await apiKey.isDisabled())throw new Error('API key must require explicit unlock');
  await page.getByRole('button',{name:'Replace n8n API key',exact:true}).click();await apiKey.fill(password);
  await page.getByRole('button',{name:'Save all settings',exact:true}).click();await page.getByText('Settings saved.',{exact:true}).waitFor();
  if(parseEnv(await readFile(join(dir,'.env.local'),'utf8')).N8N_API_KEY!=='existing-test-key')throw new Error('General settings replaced API key');
  await page.getByRole('button',{name:'Replace n8n API key',exact:true}).click();await apiKey.fill(password);
  await page.getByRole('button',{name:'Verify & save n8n key',exact:true}).click();await page.locator('#notice').filter({hasText:'likely from browser autofill'}).waitFor();
  await apiKey.fill('invalid-test-key');await page.getByRole('button',{name:'Verify & save n8n key',exact:true}).click();await page.locator('#notice').filter({hasText:'HTTP 401'}).waitFor();
  if(parseEnv(await readFile(join(dir,'.env.local'),'utf8')).N8N_API_KEY!=='existing-test-key')throw new Error('Rejected key replaced working key');
  await apiKey.fill('verified-test-key');await page.getByRole('button',{name:'Verify & save n8n key',exact:true}).click();await page.getByText('n8n key verified and saved. Workflow controls use it immediately.',{exact:true}).waitFor();
  if(parseEnv(await readFile(join(dir,'.env.local'),'utf8')).N8N_API_KEY!=='verified-test-key')throw new Error('Verified key was not saved');
  if(!await apiKey.isDisabled()||await apiKey.inputValue()!=='')throw new Error('Credential input must reset and lock after saving');
  await page.locator('#password-form input[name="password"]').fill(newPassword);
  await page.getByLabel('confirmPassword').fill(newPassword);
  await page.getByRole('button',{name:'Save dashboard password',exact:true}).click();
  await page.getByText('Dashboard password saved.',{exact:true}).waitFor();
  const saved=parseEnv(await readFile(join(dir,'.env.local'),'utf8'));
  if(saved.DASHBOARD_PASSWORD!==''||!saved.DASHBOARD_PASSWORD_HASH?.startsWith('scrypt:')||saved.DASHBOARD_PASSWORD_HASH.includes(newPassword))throw new Error('Password was not saved as a hash');
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByLabel('password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.locator('#notice').filter({hasText:'Incorrect dashboard password'}).waitFor();
  await page.getByLabel('password',{exact:true}).fill(newPassword);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByText('Signed in.',{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('#mode').textContent.includes('DRY RUN'));
  if(errors.length)throw new Error(errors.join('; '));
  console.log('PASS browser: locked API key form, autofilled password cannot replace key through general settings or dedicated form, n8n 401 preserves existing key, verified key saves and relocks, password change and login work. Real credentials unchanged.');
}finally{
  await browser?.close();
  if(n8n)await new Promise(resolve=>n8n.close(resolve));
  if(worker&&worker.exitCode===null){const stopped=new Promise(resolve=>worker.once('exit',resolve));worker.kill();await stopped;}
  if(!resolve(dir).startsWith(resolve(tmpdir())+sep)||!basename(dir).startsWith('echolink-auth-'))throw new Error('Unexpected temporary directory');
  await rm(dir,{recursive:true,force:true});
}
