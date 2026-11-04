import '../src/env.mjs';
import { schema } from './airtable-schema.mjs';
import { saveMissing } from './local-config.mjs';
import {randomUUID} from 'node:crypto';
if (!process.env.AIRTABLE_TOKEN) { console.error('Airtable setup needs AIRTABLE_TOKEN in .env.local. Schema exports are available in airtable/.'); process.exit(1); }
const headers = { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' };
async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`https://api.airtable.com/v0/meta/${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Airtable schema API HTTP ${response.status}; verify token scopes and base access`);
  await new Promise(resolve => setTimeout(resolve, 250));
  return response.json();
}
let baseId = process.env.AIRTABLE_BASE_ID;
if (!baseId) {
  if (!process.env.AIRTABLE_WORKSPACE_ID) throw new Error('Provide AIRTABLE_BASE_ID or AIRTABLE_WORKSPACE_ID');
  const created = await api('bases', { method: 'POST', body: { name: schema.name, workspaceId: process.env.AIRTABLE_WORKSPACE_ID, tables: [{ name: schema.tables[0].name, fields: schema.tables[0].fields }] } });
  baseId = created.id;
  await saveMissing({ AIRTABLE_BASE_ID: baseId });
  console.log('Created EchoLink Airtable base and saved its ID locally.');
}
const live = (await api(`bases/${baseId}/tables`)).tables;
for (const table of schema.tables) {
  if (live.some(t => t.name === table.name)) continue;
  const created = await api(`bases/${baseId}/tables`, { method: 'POST', body: { name: table.name, fields: table.fields.filter(f => !f.linkedTable) } });
  live.push(created);
  console.log(`Created ${table.name}`);
}
for (const table of schema.tables) {
  const target = live.find(t => t.name === table.name);
  for (const field of table.fields) {
    const existing = target.fields.find(f => f.name === field.name);
    if (existing) {
      if (existing.type !== field.type && !(field.name === 'Timestamp Logged' && existing.type === 'createdTime')) throw new Error(`Existing field ${table.name}/${field.name} has incompatible type; existing data was preserved`);
      if (field.linkedTable && existing.options?.linkedTableId !== live.find(t => t.name === field.linkedTable).id) throw new Error(`Existing link ${table.name}/${field.name} targets another table`);
      if(field.type==='singleSelect'){
        const choices=existing.options?.choices||[],missing=field.options.choices.filter(c=>!choices.some(old=>old.name===c.name));
        // Airtable's metadata API cannot extend existing select choices. Its
        // supported typecast flow creates options on a synthetic record; remove
        // only that returned probe ID immediately afterward, preserving user rows.
        for(const choice of missing){
          const endpoint=`https://api.airtable.com/v0/${baseId}/${target.id}`;
          const primary=target.fields[0],fields={[field.name]:choice.name};
          if(primary.type==='singleLineText')fields[primary.name]='EchoLink schema probe '+randomUUID();
          const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({typecast:true,records:[{fields}]}),signal:AbortSignal.timeout(30000)});
          if(!response.ok)throw new Error(`Cannot add ${field.name}/${choice.name}; Airtable typecast HTTP ${response.status}. Creator access is required`);
          const id=(await response.json()).records?.[0]?.id;
          if(!/^rec[A-Za-z0-9]+$/.test(id||''))throw new Error('Schema probe response has no safe record ID');
          const cleanup=await fetch(endpoint+'?records%5B%5D='+encodeURIComponent(id),{method:'DELETE',headers,signal:AbortSignal.timeout(30000)});
          if(!cleanup.ok)throw new Error('Schema probe cleanup failed for record '+id);
          console.log(`Added choice to ${table.name}/${field.name}; temporary probe removed`);
        }
      }
      continue;
    }
    const { linkedTable, ...definition } = field;
    if (linkedTable) definition.options = { linkedTableId: live.find(t => t.name === linkedTable).id };
    const created = await api(`bases/${baseId}/tables/${target.id}/fields`, { method: 'POST', body: definition });
    target.fields.push(created);
    console.log(`Added ${table.name}/${field.name}`);
  }
}
const log = live.find(t => t.name === schema.tables[2].name);
await saveMissing({ AIRTABLE_LOG_TIMESTAMP_WRITABLE: String(log.fields.find(f => f.name === 'Timestamp Logged')?.type === 'dateTime') });
console.log('Airtable schema ready. Existing tables, fields and records were preserved.');
