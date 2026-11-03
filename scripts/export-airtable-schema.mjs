import { mkdir, writeFile } from 'node:fs/promises';
import { schema } from './airtable-schema.mjs';
await mkdir('airtable', { recursive: true });
await writeFile('airtable/schema.json', JSON.stringify(schema, null, 2) + '\n');
const csv = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
let markdown = '# Complete Airtable schema\n\nCreate all three tables with the exact names below. No existing records are supplied.\nCSV files contain headers only; JSON includes field types, select choices and link targets.\n\n' + schema.notes.map(n => `- ${n}`).join('\n') + '\n\n';
for (const [i, table] of schema.tables.entries()) {
  await writeFile(`airtable/${i + 1}-${['page-configurations','ingestion-feeds','content-log'][i]}.csv`, '\uFEFF' + table.fields.map(f => csv(f.name)).join(',') + '\r\n');
  markdown += `## ${table.name}\n\n| Field | Type | Options / relationship |\n| --- | --- | --- |\n`;
  for (const field of table.fields) markdown += `| ${field.name} | ${field.type} | ${field.linkedTable || field.options?.choices?.map(c => c.name).join(', ') || field.description || ''} |\n`;
  markdown += '\n';
}
await writeFile('airtable/SCHEMA.md', markdown);
console.log('Exported complete three-table schema, Markdown specification and three header-only CSV files.');
