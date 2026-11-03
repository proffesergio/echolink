import '../src/env.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {allRecords,airtable,tables} from '../src/airtable.mjs';
import {saveSettings} from '../src/settings.mjs';
const catalog=JSON.parse(await readFile('sources/bangla-rss-catalog.json','utf8'));
const sources=catalog.sources.filter(s=>s.verified);
if(new Set(sources.map(s=>s.publisher)).size<20)throw new Error('Need 20 verified distinct Bangla publishers');
const pages=await allRecords(tables().pages),page=pages.find(p=>p.fields['Page ID']==='echolink-onboarding');
if(!page)throw new Error('Select the onboarding page before importing source templates');
const existing=await allRecords(tables().feeds);
const hosts=new Set((process.env.ALLOWED_SOURCE_HOSTS||'').split(',').filter(Boolean));
let imported=0;
for(const [i,source]of sources.entries()){
  hosts.add(new URL(source.url).hostname);source.articleHosts.forEach(h=>hosts.add(h));
  const id=`bangla-${source.publisher}`;
  if(existing.some(r=>r.fields['Feed ID']===id))continue;
  // An explicitly visible alternate publisher is a continuity fallback, not a
  // promise to recover the exact blocked article. All sources remain disabled.
  const fallback=sources[(i+1)%sources.length].url;
  await airtable(tables().feeds,{method:'POST',body:{records:[{fields:{'Feed ID':id,'Feed Name':source.name,'Linked Page':[page.id],'RSS / Scraper URL':source.url,'Fallback URL':fallback,'Active Status':false}}]}});
  imported++;
}
await saveSettings({ALLOWED_SOURCE_HOSTS:[...hosts].sort().join(',')});
let report=`# Verified Bangla RSS publishers\n\nChecked: ${catalog.checkedAt}. ${sources.length} distinct publishers passed an actual HTTP fetch, RSS/Atom parsing, at least three items, and Bangla script in at least 60% of sampled titles. Availability can change.\n\nAll were imported disabled and linked to the onboarding page. A feed's visible fallback uses the next verified publisher; it supplies alternate news, not the exact blocked article. Edit this editorial choice before enabling.\n\n| Publisher | Verified RSS | Items at check |\n| --- | --- | --- |\n`;
for(const source of sources)report+=`| ${source.name} | ${source.url} | ${source.itemCount} |\n`;
await writeFile('sources/VERIFIED.md',report);
console.log(`Imported ${imported} disabled Bangla feeds; ${sources.length} distinct publishers verified. Source hostname allowlist updated.`);
