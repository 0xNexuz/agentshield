import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTestnetAccountId, testnetStatus, testnetAccount } from './near-testnet-rpc.mjs';
import { verifyLivePayment } from './verify-testnet-live-payment.mjs';
import { verifyNegativeScenarios } from './verify-testnet-negative-scenarios.mjs';
import counterpartyRoute from '../api/testnet/counterparty.js';
import liveInjectionRoute from '../api/live/injection.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../outputs/agentshield-ui');
const mime = {'.webp':'image/webp','.svg':'image/svg+xml','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.md':'text/markdown; charset=utf-8','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
http.createServer(async (req,res)=>{
  const name = decodeURIComponent((req.url || '/').split('?')[0]);
  if (name === '/api/live/injection') {
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 10_000) break; }
    const reply = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; return this; },
      status(code) { this.statusCode = code; return this; },
      json(body) { res.writeHead(this.statusCode, { ...this.headers, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); return this; } };
    return liveInjectionRoute({ method: req.method, headers: req.headers, body: raw, socket: req.socket }, reply);
  }
  if (name === '/api/testnet/counterparty') {
    const query = Object.fromEntries(new URL(req.url, 'http://127.0.0.1').searchParams);
    const reply = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; return this; },
      status(code) { this.statusCode = code; return this; },
      json(body) { res.writeHead(this.statusCode, { ...this.headers, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); return this; } };
    return counterpartyRoute({ method: req.method, query }, reply);
  }
  if (name === '/api/testnet/status' || name === '/api/testnet/account' || name === '/api/testnet/proof' || name === '/api/testnet/gallery') {
    if (req.method !== 'GET') {res.writeHead(405);return res.end('Method not allowed');}
    const accountId = name.endsWith('/account') ? new URL(req.url, 'http://127.0.0.1').searchParams.get('id') : null;
    if (name.endsWith('/account') && !isTestnetAccountId(accountId)) {
      res.writeHead(400, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      return res.end(JSON.stringify({error:'Enter a valid .testnet or 64-character implicit account ID.'}));
    }
    try {
      const data = name.endsWith('/status') ? await testnetStatus()
        : name.endsWith('/proof') ? await verifyLivePayment()
        : name.endsWith('/gallery') ? await verifyNegativeScenarios()
        : await testnetAccount(accountId);
      res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      return res.end(JSON.stringify(data));
    } catch (error) {
      res.writeHead(502, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      return res.end(JSON.stringify({error:error.message}));
    }
  }
  if (name === '/AgentShield-Specification.md') {
    fs.readFile(path.resolve(root, '../AgentShield-Specification.md'), (err, data) => {
      if (err) {res.writeHead(404);return res.end('Not found');}
      res.writeHead(200, {'Content-Type': 'text/markdown; charset=utf-8'});res.end(data);
    });
    return;
  }
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + path.sep) && file !== path.join(root,'index.html')) {res.writeHead(403);return res.end();}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});res.end(data);});
}).listen(Number(process.env.AGENTSHIELD_PREVIEW_PORT || 4321),'127.0.0.1',()=>console.log(`AgentShield preview on http://127.0.0.1:${process.env.AGENTSHIELD_PREVIEW_PORT || 4321}`));
