const text = (name, description) => ({ name, type: 'singleLineText', ...(description ? { description } : {}) });
const long = name => ({ name, type: 'multilineText' });
const select = (name, choices) => ({ name, type: 'singleSelect', options: { choices: choices.map(name => ({ name })) } });
const checkbox = name => ({ name, type: 'checkbox', options: { icon: 'check', color: 'greenBright' } });
const number = (name, precision = 0) => ({ name, type: 'number', options: { precision } });
const date = name => ({ name, type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'utc' } });
export const schema = {
  name: 'EchoLink News Automation', version: 1,
  notes: ['Create all three tables, then resolve Linked Page fields to the Page Configurations table.', 'IDs use single line text for API provisioning. Airtable record IDs are the runtime relational keys.', 'Posting windows use HH:mm text; Timestamp Logged is a writable date/time supplied by the worker.', 'FB Permanent Page Token is a legacy placeholder; worker authentication uses secret aliases.'],
  tables: [
    { name: '[] Page Configurations', fields: [text('Page ID'), text('FB Page Name'), text('FB Page ID'), text('FB Permanent Page Token', 'Legacy placeholder. Use FB Secret Alias and local credential storage instead.'), select('Target Language', ['Bangla','English','Bilingual-Mix']), select('AI Infrastructure Target', ['Ollama','LocalAI','LM Studio','Neon AI Gateway']), text('Local Endpoint URL'), text('Model Identifier'), number('Temperature', 2), text('Posting Window Start'), text('Posting Window End'), number('Max Posts Per Day'), checkbox('Require Human Approval'), checkbox('Active Status'), text('Timezone'), text('AI Secret Alias'), text('FB Secret Alias')] },
    { name: '[] Ingestion Feeds', fields: [text('Feed ID'), { name: 'Linked Page', type: 'multipleRecordLinks', linkedTable: '[] Page Configurations' }, text('Feed Name'), { name: 'RSS / Scraper URL', type: 'url' }, { name: 'Fallback URL', type: 'url' }, checkbox('Active Status')] },
    { name: '[] Content Log & Deduplication', fields: [text('Log ID'), text('Automation ID'), text('Article Hash ID'), text('Semantic Vector ID'), { name: 'Linked Page', type: 'multipleRecordLinks', linkedTable: '[] Page Configurations' }, text('Source Title'), { name: 'Source URL', type: 'url' }, long('Extracted Text Content'), long('AI Generated Caption'), long('Media Attachment URLs'), select('Status', ['Queued','Pending Approval','Approved','Posted','Skipped (Duplicate)','Skipped (Outside Window)','Failed','Publishing','Publish Unknown','Dry Run','Rejected']), select('Approval Decision', ['Approved','Rejected']), text('FB Post ID Reference'), date('Timestamp Logged'), date('Timestamp Published')] },
  ],
};
schema.tables[0].fields.push(number('Source Comment Delay Minutes'), number('Minimum Minutes Between Posts'));
  schema.tables[2].fields.find(f=>f.name==='Status').options.choices.push({name:'Draft'});
  schema.tables[2].fields.push(select('Source Comment Status',['Queued','Sending','Sent','Unknown','Failed','Skipped']),text('Source Comment ID'),date('Source Comment Due At'),long('Outcome Detail'));
schema.tables[2].fields.push(date('Source Published At'),date('Scheduled At'),long('Editorial Analysis'),long('Image Suggestion'),number('Selection Score',2),long('Selection Reason'),text('Dashboard Panel'));
schema.tables[2].fields.push({name:'Website Article URL',type:'url'},text('Website Post ID'),select('Website Status',['Draft','Published','Failed','Unknown']));
