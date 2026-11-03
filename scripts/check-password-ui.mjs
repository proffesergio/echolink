import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {randomBytes} from 'node:crypto';
import {parseEnv} from 'node:util';
const dir=await mkdtemp(join(tmpdir(),'echolink-auth-')),key=randomBytes(32).toString('hex');
const origin='http://127.0.0.1:18791',password='temporary environment password',newPassword='temporary UI created password';
let worker,browser;
try{
  await writeFile(join(dir,'.env.local'),`WORKER_API_KEY=${key}\nDASHBOARD_PASSWORD='${password}'\nPORT=18791\nHOST=127.0.0.1\nDRY_RUN=true\n`);
  worker=spawn(process.execPath,[resolve('src/server.mjs')],{cwd:dir,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,WORKER_API_KEY:key,DASHBOARD_PASSWORD:password,DASHBOARD_PASSWORD_HASH:'',PORT:'18791'}});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Temporary worker startup timed out')),10000);worker.stdout.on('data',chunk=>{if(String(chunk).includes('listening')){clearTimeout(timer);resolve();}});worker.once('error',reject);});
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const configuration={dryRun:true,passwordConfigured:true,passwordSource:'environment',intervals:{sync:15,ingest:10,approvals:1,process:2,comments:1,mirror:2,analytics:360}};
  // Only service-backed dashboard data is stubbed; login, password persistence,
  // session cookies, logout and password verification use the actual HTTP server.
  await page.route('**/admin/api/configuration',route=>route.fulfill({json:configuration}));
  await page.route('**/admin/api/state',route=>route.fulfill({json:{...configuration,pages:[],feeds:[],articles:[],counts:[],audit:[],facebookAliases:[],aiAliases:[],configuration}}));
  await page.goto(origin+'/admin');await page.getByLabel('password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('heading',{name:'One pipeline. Every page.'}).waitFor();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.locator('#password-form input[name="password"]').fill(newPassword);
  await page.getByLabel('confirmPassword').fill(newPassword);
  await page.getByRole('button',{name:'Save dashboard password',exact:true}).click();
  await page.getByText('Dashboard password saved.',{exact:true}).waitFor();
  const saved=parseEnv(await readFile(join(dir,'.env.local'),'utf8'));
  if(saved.DASHBOARD_PASSWORD!==''||!saved.DASHBOARD_PASSWORD_HASH?.startsWith('scrypt:')||saved.DASHBOARD_PASSWORD_HASH.includes(newPassword))throw new Error('Password was not saved as a hash');
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByLabel('password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByText('Incorrect dashboard password',{exact:true}).waitFor();
  await page.getByLabel('password',{exact:true}).fill(newPassword);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByText('Signed in.',{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('#mode').textContent.includes('DRY RUN'));
  if(errors.length)throw new Error(errors.join('; '));
  console.log('PASS browser: .env password login → Settings password creation → hash saved → old password rejected → new password login. User credentials unchanged.');
}finally{
  await browser?.close();
  if(worker&&worker.exitCode===null){const stopped=new Promise(resolve=>worker.once('exit',resolve));worker.kill();await stopped;}
  if(!resolve(dir).startsWith(resolve(tmpdir())+sep)||!basename(dir).startsWith('echolink-auth-'))throw new Error('Unexpected temporary directory');
  await rm(dir,{recursive:true,force:true});
}
