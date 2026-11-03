import '../src/env.mjs';
import { airtable, allRecords, tables } from '../src/airtable.mjs';
const pages = await allRecords(tables().pages);
let page = pages.find(r => r.fields['Page ID'] === 'echolink-onboarding');
if (!page && pages.length === 0) {
  page = (await airtable(tables().pages, { method: 'POST', body: { records: [{ fields: {
    'Page ID': 'echolink-onboarding', 'FB Page Name': 'SETUP — enter your page and model before enabling',
    'Target Language': 'Bangla', 'AI Infrastructure Target': 'Ollama', 'Local Endpoint URL': 'http://localhost:11434/v1/chat/completions',
    Temperature: 0.5, 'Posting Window Start': '09:00', 'Posting Window End': '23:00', 'Max Posts Per Day': 3,
    'Require Human Approval': true, 'Active Status': false, Timezone: 'Asia/Dhaka', 'FB Secret Alias': 'primary-page',
  } }] } })).records[0];
  console.log('Created an inactive onboarding page configuration.');
}
const feeds = await allRecords(tables().feeds);
if (page && !feeds.some(r => r.fields['Feed ID'] === 'echolink-onboarding-feed')) {
  await airtable(tables().feeds, { method: 'POST', body: { records: [{ fields: { 'Feed ID': 'echolink-onboarding-feed', 'Feed Name': 'BBC News — example, disabled', 'Linked Page': [page.id], 'RSS / Scraper URL': 'https://feeds.bbci.co.uk/news/rss.xml', 'Active Status': false } }] } });
  console.log('Created a disabled example feed linked to the onboarding page.');
}
