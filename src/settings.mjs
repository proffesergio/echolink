import { readFile, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
let pending = Promise.resolve();
export function envValue(value) {
  if (/[\r\n]/.test(value)) throw new Error('Setting must fit on one line');
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  throw new Error('Setting cannot contain both quote styles');
}
export function saveSettings(values) {
  const run = pending.then(async () => {
    let source = await readFile('.env.local', 'utf8');
    const old = parseEnv(source);
    for (const [key, value] of Object.entries(values)) {
      if (!/^[A-Z][A-Z0-9_]+$/.test(key) || typeof value !== 'string' || value.includes('\n')) throw new Error('Invalid setting');
      source = source.replace(new RegExp(`^${key}=.*(?:\\r?\\n|$)`, 'gm'), '');
      source += `\n${key}=${envValue(value)}\n`;
    }
    const temporary = `.env.local.${randomUUID()}.tmp`;
    await writeFile(temporary, source, { mode: 0o600 });
    await rename(temporary, '.env.local');
    Object.assign(process.env, values);
    return Object.keys(old).length;
  });
  pending = run.catch(() => {});
  return run;
}
