export class N8nCredentialError extends Error {}

// Only a successful read from the actual local n8n workflow API authorizes
// replacing a working credential. Never return upstream bodies or the key.
export async function validateN8nAPIKey(key, fetcher = fetch) {
  if (typeof key !== 'string' || !key.trim() || /[\r\n]/.test(key)) {
    throw new N8nCredentialError('Paste the full n8n API key, not its name.');
  }
  const base = new URL(process.env.N8N_BASE_URL || 'http://localhost:5678');
  if (!['http:', 'https:'].includes(base.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || base.username || base.password) {
    throw new N8nCredentialError('Configure a localhost n8n API endpoint before replacing the key.');
  }
  let response;
  try {
    response = await fetcher(new URL('/api/v1/workflows/echolinkPipeline01', base), {
      headers: {'X-N8N-API-KEY': key.trim()}, redirect: 'error', signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new N8nCredentialError('Cannot reach local n8n. Start n8n and try again; the saved key was kept.');
  }
  if (!response.ok) {
    throw new N8nCredentialError(`n8n rejected key verification (HTTP ${response.status}). Check the full key and workflow read permission; the saved key was kept.`);
  }
  let workflow;
  try { workflow = await response.json(); } catch {}
  if (workflow?.id !== 'echolinkPipeline01') {
    throw new N8nCredentialError('n8n did not return the EchoLink workflow. Check its import and API endpoint; the saved key was kept.');
  }
  return key.trim();
}
