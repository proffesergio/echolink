import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
export class HttpError extends Error {
  constructor(status) { super(`Upstream HTTP ${status}`); this.status = status; }
}
export const hostList = name => (process.env[name] || '').split(',').map(s => s.trim()).filter(Boolean);
function privateIP(ip) {
  if (isIP(ip) === 6) return /^(::|fc|fd|fe80|ff)/i.test(ip) || ip.includes('.');
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a >= 224;
}
export async function request(url, options = {}, { hosts, local = false, limit = 2_000_000, timeoutMs = 90000 } = {}) {
  const u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || (hosts && !hosts.includes(u.hostname))) throw new Error('Endpoint rejected by allowlist');
  if (!local) {
    const addresses = await lookup(u.hostname, { all: true });
    if (!addresses.length || addresses.some(a => privateIP(a.address))) throw new Error('Private source address rejected');
    if (u.protocol !== 'https:') throw new Error('External services require HTTPS');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600000) throw new Error('Invalid request timeout');
  const response = await fetch(u, { ...options, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) { await response.body?.cancel(); throw new HttpError(response.status); }
  const chunks = []; let length = 0;
  for await (const chunk of response.body || []) {
    length += chunk.length;
    if (length > limit) { await response.body?.cancel().catch(() => {}); throw new Error('Response too large'); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
export const jsonRequest = async (url, options, policy) => JSON.parse(await request(url, options, policy));
