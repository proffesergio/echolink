import { jsonRequest } from './net.mjs';
let lastRequest = 0;
let chain = Promise.resolve();
export const tables = () => ({ pages: process.env.AIRTABLE_PAGES_TABLE || '[] Page Configurations', feeds: process.env.AIRTABLE_FEEDS_TABLE || '[] Ingestion Feeds', log: process.env.AIRTABLE_LOG_TABLE || '[] Content Log & Deduplication' });
export async function airtable(table, { method = 'GET', body, params } = {}) {
  if (!process.env.AIRTABLE_TOKEN || !process.env.AIRTABLE_BASE_ID) throw new Error('Airtable credentials are missing');
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(process.env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  // Serialize requests across concurrent jobs; stay below Airtable's per-base limit.
  const work = chain.then(async () => {
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 240 - (Date.now() - lastRequest))));
    lastRequest = Date.now();
    return jsonRequest(url, { method, headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }, { hosts: ['api.airtable.com'], timeoutMs:15000 });
  });
  chain = work.catch(() => {});
  return work;
}
export async function allRecords(table) {
  const records = []; let offset;
  do {
    const result = await airtable(table, { params: { pageSize: '100', ...(offset ? { offset } : {}) } });
    records.push(...result.records); offset = result.offset;
  } while (offset);
  return records;
}
