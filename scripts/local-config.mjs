import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { envValue } from '../src/settings.mjs';
export async function saveMissing(values, path = '.env.local') {
  let source = await readFile(path, 'utf8').catch(e => { if (e.code === 'ENOENT') return ''; throw e; });
  const current = parseEnv(source);
  for (const [key, value] of Object.entries(values)) {
    if (current[key]) continue;
    source = source.replace(new RegExp(`^${key}=.*(?:\\r?\\n|$)`, 'gm'), '');
    source += `\n${key}=${envValue(value)}\n`;
    process.env[key] = value;
  }
  await writeFile(path, source, { mode: 0o600 });
}
