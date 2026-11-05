import '../src/env.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const base=process.env.CMS_TEST_ORIGIN||'http://127.0.0.1:18792';
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
const tabs=['Overview','Operations center','Review queue','Drafts','Scheduled','Published','Connections','Pages & models','News feeds','Workflow','Activity','Settings','Getting started'];
let snapshot;
try{
  await page.goto(base+'/admin');await page.getByLabel('password',{exact:true}).fill(process.env.DASHBOARD_PASSWORD);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:"Today's top story → your draft"}).waitFor();
  snapshot=await (await page.request.get(base+'/admin/api/state')).json();
  await page.route('**/admin/api/state',route=>route.fulfill({json:snapshot}));
  await mkdir('.codex/design',{recursive:true});
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:width===1440?1000:844});
    for(const name of tabs){
      if(width===390)await page.getByRole('button',{name:'Open navigation',exact:true}).click();
      await page.getByRole('button',{name,exact:true}).click();
      assert.equal(await page.locator('#heading').textContent(),name);
      assert.equal(await page.locator('[aria-current="page"]').count(),1);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),name+' has horizontal overflow at '+width);
      if(width===390)assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'false');
      if(width===390)await page.waitForFunction(()=>document.querySelector('#sidebar').getBoundingClientRect().right<=1);
      if(['Connections','Overview','Review queue','Scheduled','Settings'].includes(name))await page.screenshot({path:'.codex/design/live-'+name.toLowerCase().replaceAll(' ','-')+'-'+width+'.png',fullPage:true});
    }
  }
  await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Connections',exact:true}).click();
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim()),'#0b0e14');
  assert.equal(await page.locator('[data-connection-name]').count(),16);
  const search=page.getByRole('searchbox',{name:'Find a connection'});await search.fill('Bright Data');
  assert.equal(await page.locator('[data-connection-name]:visible').count(),1);
  assert.equal(await page.locator('[data-connection-name]:visible button').count(),0,'Planned services have no runnable controls');
  await search.fill('');await page.getByRole('button',{name:'Planned 4',exact:true}).click();
  assert.equal(await page.locator('[data-connection-name]:visible').count(),4);
  await page.getByLabel('Configured only',{exact:true}).check();assert.equal(await page.locator('[data-connection-name]:visible').count(),0);
  await page.getByLabel('Configured only',{exact:true}).uncheck();await page.getByRole('button',{name:'All 16',exact:true}).click();
  await page.locator('[data-connection-open="n8n"]').click();
  const drawer=page.getByRole('dialog'),apiKey=drawer.getByLabel('n8nAPIKey',{exact:true});
  assert.ok(await apiKey.isDisabled());assert.equal(await apiKey.inputValue(),'');
  await drawer.getByRole('button',{name:'Replace n8n API key',exact:true}).click();assert.ok(await apiKey.isEnabled());
  await page.keyboard.press('Escape');assert.ok(!await drawer.isVisible());
  assert.ok(await page.locator('[data-connection-open="n8n"]').evaluate(el=>el===document.activeElement),'Focus returns to provider');
  const saved=[];
  await page.route('**/admin/api/settings',async route=>{saved.push(route.request().postDataJSON());await route.fulfill({json:{ok:true}});});
  await page.locator('[data-connection-open="airtable"]').click();await drawer.getByLabel('airtableToken',{exact:true}).fill('synthetic-test-token-never-saved');
  await drawer.getByRole('button',{name:'Save connection settings',exact:true}).click();await page.locator('#notice').filter({hasText:'Connection settings saved.'}).waitFor();
  assert.equal(saved.length,1);assert.deepEqual(Object.keys(saved[0]).sort(),['airtableBaseId','airtableToken']);assert.ok(!('n8nAPIKey' in saved[0]));
  assert.equal(await drawer.getByLabel('airtableToken',{exact:true}).inputValue(),'');
  await page.keyboard.press('Escape');
  await page.locator('[data-connection-open="website"]').click();
  await drawer.getByLabel('Enable website publication',{exact:true}).check();
  await drawer.getByLabel('Facebook Page IDs allowed to publish to the website',{exact:true}).fill('123,456');
  await drawer.getByRole('button',{name:'Save connection settings',exact:true}).click();
  await page.waitForFunction(()=>{const form=document.querySelector('#connection-settings-form');return form&&form.dataset.saving!=='true'&&!form.querySelector('button[type="submit"]').disabled;});
  assert.equal(saved.length,2);assert.equal(saved[1].websiteEnabled,true);assert.equal(saved[1].websitePageIds,'123,456');
  assert.ok(!('FB_AUTOMATIC_LINKS_ENABLED' in saved[1]));assert.ok(!('n8nAPIKey' in saved[1]));
  await page.keyboard.press('Escape');
  let calls=0;
  await page.route(/\/admin\/api\/(test-facebook|test-sheets|test-database|test-airtable|test-n8n|test-website|models)$/,async route=>{
    calls++;await route.fulfill({status:route.request().url().endsWith('test-sheets')?400:200,json:route.request().url().endsWith('test-sheets')?{error:'Synthetic Sheets access denied'}:{ok:true,models:['test-model']}});
  });
  await page.getByRole('button',{name:'Test all configured',exact:true}).click();await page.locator('#notice').filter({hasText:'Synthetic Sheets access denied'}).waitFor();
  assert.ok(calls>=4,'Configured services were individually tested');
  assert.ok(await page.locator('[data-connection-name]').filter({hasText:'Google Sheets'}).getByText('Needs attention',{exact:true}).isVisible());
  assert.deepEqual(errors,[]);
  console.log('PASS redesign browser: all 13 views at 1440/390px, approved tokens, no overflow, mobile navigation, real provider counts, search/categories/configured filter, planned controls disabled, keyboard drawer/focus, empty locked key, scoped settings save, test-all partial failure. All test writes intercepted.');
}finally{await browser.close();}
