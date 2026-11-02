// Local development helper for Windows environments where Cargo's Schannel TLS
// handshake fails. Run with `node --use-system-ca`; upstream TLS stays verified.
import http from 'node:http';

const port = 4727;
const base = `http://127.0.0.1:${port}`;
const cratePath = /^\/api\/v1\/crates\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9.+_-]+)\/download$/;
const waiters = [];
let active = 0;

async function verifiedFetch(url) {
  if (active >= 6) await new Promise(resolve => waiters.push(resolve));
  active++;
  try {
    let lastError;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const result = await fetch(url, { signal: AbortSignal.timeout(45000) });
        const body = Buffer.from(await result.arrayBuffer());
        return { status: result.status, contentType: result.headers.get('content-type'), body };
      } catch (error) {
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    throw lastError;
  } finally {
    active--;
    waiters.shift()?.();
  }
}

http.createServer(async (request, response) => {
  if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
  const path = new URL(request.url, base).pathname;
  if (path === '/config.json') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ dl: `${base}/api/v1/crates`, api: 'https://crates.io' }));
    return;
  }
  const match = path.match(cratePath);
  const upstream = match
    ? `https://static.crates.io/crates/${match[1]}/${match[1]}-${match[2]}.crate`
    : /^\/[a-zA-Z0-9_./-]+$/.test(path) && !path.includes('..')
      ? `https://index.crates.io${path}`
      : null;
  if (!upstream) { response.writeHead(400); response.end('Invalid registry path'); return; }
  try {
    const result = await verifiedFetch(upstream);
    response.writeHead(result.status, {
      'content-type': result.contentType || 'application/octet-stream',
      'cache-control': 'public, max-age=3600',
    });
    response.end(result.body);
  } catch (error) {
    console.error(`Registry fetch failed for ${path}: ${error.cause?.message || error.message}`);
    response.writeHead(502);
    response.end(`Verified upstream connection failed: ${error.message}`);
  }
}).listen(port, '127.0.0.1', () => console.log(`Verified Cargo registry proxy listening at ${base}`));
