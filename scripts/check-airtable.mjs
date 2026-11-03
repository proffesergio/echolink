import '../src/env.mjs';
import { randomUUID } from 'node:crypto';
import { hash, titleHash } from '../src/core.mjs';
import { query, closePools } from '../src/db.mjs';
import { airtable, tables } from '../src/airtable.mjs';
import { mirror, approvals } from '../src/jobs.mjs';
// A synthetic probe must never send a human notification or reach publishing.
process.env.APPROVAL_NOTIFICATION_URL = '';
const id = randomUUID(), caption = 'INTEGRATION TEST ONLY — this record is removed after verification.';
const auditIds=[randomUUID(),randomUUID()];
let auditRecordIds=[];
let pageId, logId;
try {
  const page = await airtable(tables().pages, { method: 'POST', body: { records: [{ fields: { 'Page ID': `probe-${id}`, 'FB Page Name': 'EchoLink integration probe (temporary)', 'Active Status': false, 'Require Human Approval': true } }] } });
  pageId = page.records[0].id;
  await query(`INSERT INTO echolink.articles(id,page_id,url_hash,title_hash,title,source_url,body,caption,caption_hash,status)
    VALUES($1,$2,$3,$4,$5,'https://example.com/echolink-probe',$6,$6,$7,'Pending Approval')`, [id, pageId, hash(id), titleHash(id), 'INTEGRATION TEST ONLY', caption, hash(caption)]);
  for(const [index,status] of ['Skipped (Duplicate)','Failed'].entries()) {
    await query('INSERT INTO echolink.ingestion_events(id,event_key,page_id,title,source_url,status,detail) VALUES($1,$2,$3,$4,$5,$6,$7)',[auditIds[index],hash(auditIds[index]),pageId,'INTEGRATION AUDIT ONLY','https://example.com/echolink-probe',status,'Synthetic duplicate/failure audit verification']);
  }
  await mirror();
  let row = (await query('SELECT airtable_id,dirty,status,approval_hash FROM echolink.articles WHERE id=$1', [id])).rows[0];
  logId = row.airtable_id;
  if (!logId || row.dirty) throw new Error('Airtable mirror did not clear synchronization backlog');
  console.log('PASS Airtable: linked-page upsert and PostgreSQL synchronization acknowledgment.');
  const auditRows=(await query('SELECT airtable_id,dirty FROM echolink.ingestion_events WHERE id=ANY($1::uuid[])',[auditIds])).rows;
  auditRecordIds=auditRows.map(r=>r.airtable_id).filter(Boolean);
  if(auditRecordIds.length!==2||auditRows.some(r=>r.dirty))throw new Error('Audit event sync did not complete');
  const mirroredAudits=await airtable(tables().log,{params:{filterByFormula:`OR({Automation ID}='${auditIds[0]}',{Automation ID}='${auditIds[1]}')`}});
  const statuses=mirroredAudits.records.map(r=>r.fields.Status).sort();
  if(JSON.stringify(statuses)!==JSON.stringify(['Failed','Skipped (Duplicate)']))throw new Error('Airtable audit statuses do not match');
  console.log('PASS Airtable: distinct skipped-duplicate and failed event records persisted with correct statuses.');
  await airtable(tables().log, { method: 'PATCH', body: { records: [{ id: logId, fields: { 'AI Generated Caption': 'Edited test caption', 'Approval Decision': 'Approved' } }] } });
  await approvals();
  row = (await query('SELECT status FROM echolink.articles WHERE id=$1', [id])).rows[0];
  if (row.status !== 'Pending Approval') throw new Error('Edited caption was incorrectly approved');
  console.log('PASS approval protection: edited caption cannot approve the original payload.');
  await airtable(tables().log, { method: 'PATCH', body: { records: [{ id: logId, fields: { 'AI Generated Caption': caption, 'Approval Decision': 'Approved' } }] } });
  await approvals();
  row = (await query('SELECT status,approval_hash FROM echolink.articles WHERE id=$1', [id])).rows[0];
  if (row.status !== 'Approved' || row.approval_hash !== hash(caption)) throw new Error('Explicit matching approval was not recorded');
  console.log('PASS Airtable → PostgreSQL approval roundtrip for synthetic test content.');
} catch (e) { console.error('Airtable integration probe failed:', e.message); process.exitCode = 1; }
finally {
  // Only delete artifacts created by this invocation. Never touch existing rows.
  if (!logId) logId = (await query('SELECT airtable_id FROM echolink.articles WHERE id=$1', [id])).rows[0]?.airtable_id;
  if (logId) await airtable(tables().log, { method: 'DELETE', params: { 'records[]': logId } });
  auditRecordIds=(await query('SELECT airtable_id FROM echolink.ingestion_events WHERE id=ANY($1::uuid[])',[auditIds])).rows.map(r=>r.airtable_id).filter(Boolean);
  for(const recordId of auditRecordIds)await airtable(tables().log,{method:'DELETE',params:{'records[]':recordId}});
  await query('DELETE FROM echolink.ingestion_events WHERE id=ANY($1::uuid[])',[auditIds]);
  await query('DELETE FROM echolink.articles WHERE id=$1', [id]);
  if (pageId) await airtable(tables().pages, { method: 'DELETE', params: { 'records[]': pageId } });
  await closePools();
  console.log('Removed synthetic Airtable/database probe records; no publication attempted.');
}
