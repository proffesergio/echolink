import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import app from './app.mjs';
const host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 8787);
const server = createServer(async (req, res) => {
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 131072) { res.writeHead(413); res.end('Request too large'); return; } chunks.push(chunk); }
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const result = await app.fetch(new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers, ...(body ? { body } : {}) }));
    res.writeHead(result.status, Object.fromEntries(result.headers));
    if (result.body) Readable.fromWeb(result.body).pipe(res); else res.end();
  } catch { res.writeHead(500); res.end('Internal error'); }
});
server.requestTimeout = 15 * 60 * 1000;
server.listen(port, host, () => console.log(`EchoLink listening at http://${host}:${server.address().port}; dryRun=${process.env.DRY_RUN !== 'false'}`));
