import '../src/env.mjs';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto('http://127.0.0.1:8787/admin');
  await page.getByLabel('password',{exact:true}).fill(process.env.DASHBOARD_PASSWORD);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('heading',{name:"Today's top story → your draft"}).waitFor();
  await page.getByRole('button',{name:'Activity',exact:true}).click();
  await page.getByRole('heading',{name:'Run activity & results'}).waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('.run').length>0);
  if(!await page.locator('.run').count())throw new Error('Run history invisible');
  await page.getByRole('button',{name:'Drafts',exact:true}).click();
  await page.getByRole('heading',{name:'Drafts',exact:true,level:2}).waitFor();
  await page.getByRole('button',{name:'Scheduled',exact:true}).click();
  await page.getByRole('heading',{name:'Scheduled',exact:true,level:2}).waitFor();
  await page.getByRole('button',{name:'Published',exact:true}).click();
  await page.getByRole('heading',{name:'Published',exact:true,level:2}).waitFor();
  await page.getByRole('button',{name:'Review queue',exact:true}).click();
  await page.getByText('Editorial analysis',{exact:true}).first().waitFor();
  await page.getByText('Suggested illustrative image prompt',{exact:true}).first().waitFor();
  await page.locator('form[data-draft]').first().waitFor();
  await mkdir('.codex/logs',{recursive:true});
  await page.screenshot({path:'.codex/logs/newsroom-review.png',fullPage:true});
  // Verify that auto-refresh does not erase an unsaved edit.
  const textarea=page.locator('form[data-draft] textarea[name="caption"]').first(),original=await textarea.inputValue();
  await textarea.fill(original+'\nUnsaved UI test text');
  await page.waitForTimeout(11000);
  if(!(await textarea.inputValue()).endsWith('Unsaved UI test text'))throw new Error('Polling erased draft text');
  // Do not submit or persist changes to the user's actual draft.
  await page.getByRole('button',{name:'Connections',exact:true}).click();
  await page.getByRole('heading',{name:'Google Sheets post log'}).waitFor();
  await page.getByLabel('credentials',{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Newsroom mobile overflow');
  if(errors.length)throw new Error(errors.join('; '));
  console.log('PASS newsroom browser: preview, actual activity, Drafts/Scheduled/Published panels, analysis/media suggestions, draft editor, unsaved edit survives polling, Sheets form and mobile layout. No user edits saved.');
}finally{await browser.close();}
