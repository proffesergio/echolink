import '../src/env.mjs';
import {chromium} from 'playwright';
const origin='http://127.0.0.1:8787';
if(process.env.DRY_RUN==='false'||!process.env.N8N_API_KEY)throw new Error('Requires dry run and an n8n API key');
const ticket=await(await fetch(origin+'/admin/api/ticket',{method:'POST',headers:{Authorization:'Bearer '+process.env.WORKER_API_KEY}})).json();
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage();page.on('dialog',dialog=>dialog.accept());
let cookie;
try{
  await page.goto(origin+'/admin#ticket='+ticket.ticket);
  await page.waitForFunction(()=>document.querySelector('#mode').textContent.includes('DRY RUN'));
  cookie=(await page.context().cookies()).map(c=>c.name+'='+c.value).join('; ');
  const response=await fetch(origin+'/admin/api/state',{headers:{Cookie:cookie}}),state=await response.json();
  if(state.workflow.pipeline.active||state.workflow.legacy.some(w=>w.active))throw new Error('Control probe expects initially stopped EchoLink workflows');
  await page.getByRole('button',{name:'Workflow',exact:true}).click();
  await page.getByRole('button',{name:'Start workflow',exact:true}).click();
  await page.getByText('Workflow started.',{exact:true}).waitFor({timeout:35000});
  const live=await fetch('http://localhost:5678/api/v1/workflows/echolinkPipeline01',{headers:{'X-N8N-API-KEY':process.env.N8N_API_KEY}});
  if(!(await live.json()).active)throw new Error('n8n did not activate');
  await page.getByRole('button',{name:'Stop workflow',exact:true}).click();
  await page.getByText('Workflow stopped.',{exact:true}).waitFor({timeout:35000});
  console.log('PASS browser → dashboard → running n8n API: Start activated the single pipeline; Stop deactivated it; no server restart required.');
}finally{
  if(cookie)await fetch(origin+'/admin/api/workflow',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({action:'stop',confirmed:true})});
  await browser.close();
}
