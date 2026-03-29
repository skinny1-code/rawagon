#!/usr/bin/env node
/**
 * RAWagon App Server v2
 * - Serves all 11 apps
 * - SSE endpoint for real-time cross-app events
 * - /api/network-state  — unified network telemetry
 * - /api/anthropic-proxy — API key stays server-side (reads from .env)
 * - /health             — system health JSON
 * - /manifest.json      — PWA manifest
 */
'use strict';
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const PORT  = parseInt(process.argv[2] || process.env.PORT || '3000', 10);
const ROOT  = __dirname;
const APPS  = path.join(ROOT, 'apps');

// Load .env if present
try {
  require('fs').readFileSync('.env','utf8').split('\n').forEach(line => {
    const [k,...v] = line.split('=');
    if (k && !process.env[k]) process.env[k.trim()] = v.join('=').trim();
  });
} catch {}

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',  '.json':'application/json',
  '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon',
  '.woff2':'font/woff2', '.woff':'font/woff', '.py':'text/plain',
};

const APP_MAP = {
  'rawagon-os':'rawagon-os', 'os':'rawagon-os',
  'allcard':'1nce-allcard',  '1nce-allcard':'1nce-allcard',
  'bitpawn':'bitpawn',       'pawnsnap':'bitpawn',
  'droppa':'droppa',         'autoiq':'autoiq',
  'goldsnap':'goldsnap',     'qwks':'qwks-protocol', 'qwks-protocol':'qwks-protocol',
  'profitpilot':'profitpilot',
  'drop-the-reel':'drop-the-reel', 'dropthereel':'drop-the-reel',
  'ai-orchestrator':'ai-orchestrator', 'orchestrator':'ai-orchestrator',
  'pawnvault':'bitpawn',
};

const APP_META = {
  'rawagon-os':     { emoji:'⬡',  label:'RAWagon OS',     color:'#8b5cf6' },
  '1nce-allcard':   { emoji:'🪪', label:'1.nce AllCard',   color:'#8b5cf6' },
  'bitpawn':        { emoji:'🏦', label:'BitPawn',          color:'#f59e0b' },
  'droppa':         { emoji:'🎴', label:'Droppa',           color:'#8b5cf6' },
  'autoiq':         { emoji:'🚗', label:'AutoIQ',           color:'#60a5fa' },
  'goldsnap':       { emoji:'🥇', label:'GoldSnap',         color:'#f59e0b' },
  'qwks-protocol':  { emoji:'⛓',  label:'QWKS Protocol',   color:'#6366f1' },
  'profitpilot':    { emoji:'📊', label:'ProfitPilot',      color:'#06b6d4' },
  'drop-the-reel':  { emoji:'🎬', label:'Drop The Reel',    color:'#dc2626' },
  'ai-orchestrator':{ emoji:'🤖', label:'AI Orchestrator',  color:'#10b981' },
  'pawnvault':      { emoji:'🏦', label:'BitPawn (+ PawnVault)',  color:'#f59e0b' },
};

// SSE clients for real-time cross-app events
const sseClients = new Set();

// Network state (in-memory, persisted to network-state.json)
const STATE_FILE = path.join(ROOT, 'network-state.json');
let networkState = { events:[], stats:{}, lastUpdate: null };
try { networkState = JSON.parse(fs.readFileSync(STATE_FILE,'utf8')); } catch {}

function saveState() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(networkState, null, 2)); } catch {}
}

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  sseClients.forEach(client => { try { client.write(data); } catch { sseClients.delete(client); } });
  // Keep last 200 events
  networkState.events.unshift({ ...event, ts: Date.now() });
  networkState.events = networkState.events.slice(0, 200);
  networkState.lastUpdate = new Date().toISOString();
  saveState();
}

function serveFile(res, filePath) {
  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404: ' + path.basename(filePath));
  }
}

function indexPage(appFolders) {
  const cards = appFolders.map(name => {
    const m = APP_META[name] || { emoji:'●', label: name, color:'#7c6a9a' };
    return `<a href="/apps/${name}/" class="card" style="--c:${m.color}">
      <span class="icon">${m.emoji}</span>
      <span class="label">${m.label}</span>
    </a>`;
  }).join('\n');
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="manifest" href="/manifest.json">
<title>RAWagon — App Hub</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#07040f;color:#f0eaff;font-family:system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:32px 20px}
.logo{font-size:2.4rem;font-weight:900;background:linear-gradient(135deg,#8b5cf6,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:4px}
.sub{color:#5a4a7a;font-size:.8rem;margin-bottom:28px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;width:100%;max-width:800px}
.card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:18px 12px;text-align:center;text-decoration:none;color:inherit;transition:.15s;display:flex;flex-direction:column;align-items:center;gap:7px}
.card:hover{border-color:var(--c,#8b5cf6);background:rgba(255,255,255,.05);transform:translateY(-1px)}
.icon{font-size:1.8rem}.label{font-size:.74rem;font-weight:600;color:#c4b5f5}
.status{margin-top:24px;font-size:.72rem;color:#3d2d5a;display:flex;gap:16px}
.dot{width:6px;height:6px;border-radius:50%;background:#10b981;display:inline-block;margin-right:4px}
.footer{margin-top:16px;font-size:.68rem;color:#2d1f48}
a.health{color:#5a4a7a;text-decoration:none;font-size:.7rem}
a.health:hover{color:#8b5cf6}
</style></head><body>
<div class="logo">RAWagon</div>
<div class="sub">RAWNet Testnet · chainId 720701 · 10.117.122.142:8545</div>
<div class="grid">${cards}</div>
<div class="status">
  <span><span class="dot"></span>Server online</span>
  <span>${appFolders.length} apps</span>
  <a href="/health" class="health">health ↗</a>
  <a href="/api/network-state" class="health">network ↗</a>
</div>
<div class="footer">RAWagon Systems LLC · Proprietary Technology</div>
</body></html>`;
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const parts = pathname.split('/').filter(Boolean);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── /api/events  — SSE stream ─────────────────────────────────────────────
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
      'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*',
    });
    res.write(`data: ${JSON.stringify({ type:'connected', ts: Date.now() })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // ── /api/event  — POST a network event (any app can publish) ─────────────
  if (pathname === '/api/event' && req.method === 'POST') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const event = JSON.parse(body);
        broadcast(event);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, clients: sseClients.size }));
      } catch(e) {
        res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ── /api/network-state  — current unified state ───────────────────────────
  if (pathname === '/api/network-state') {
    const appFolders = fs.readdirSync(APPS).filter(d =>
      fs.existsSync(path.join(APPS, d, 'index.html'))
    );
    const deployed = (() => {
      try { return JSON.parse(fs.readFileSync(path.join(ROOT,'deployed-addresses.json'),'utf8')); }
      catch { return {}; }
    })();
    const contracts = deployed?.rawnet_testnet || {};
    const live = Object.entries(contracts).filter(([k,v])=>v&&v!=='pending'&&!k.startsWith('_')).length;
    const state = {
      ...networkState,
      apps: appFolders.length,
      appList: appFolders,
      contracts: { live, total: Object.keys(contracts).filter(k=>!k.startsWith('_')).length },
      sseClients: sseClients.size,
      uptime: Math.floor(process.uptime()),
      node: process.version,
      network: { name: 'RAWNet Testnet', chainId: 720701, rpc: process.env.GANACHE_RPC || 'http://10.117.122.142:8545' },
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state, null, 2));
    return;
  }

  // ── /api/anthropic-proxy  — proxy Claude calls (key stays server-side) ────
  if (pathname === '/api/anthropic-proxy' && req.method === 'POST') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'ANTHROPIC_API_KEY not set on server. Set in .env or use browser key.' } }));
      return;
    }
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      try {
        const https = require('https');
        const parsed = JSON.parse(body);
        const payload = JSON.stringify(parsed);
        const options = {
          hostname: 'api.anthropic.com', port: 443, path: '/v1/messages', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': key,
            'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(payload) },
        };
        const proxyReq = https.request(options, proxyRes => {
          res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          proxyRes.pipe(res);
        });
        proxyReq.on('error', e => { res.writeHead(502); res.end(JSON.stringify({ error: { message: e.message } })); });
        proxyReq.write(payload);
        proxyReq.end();
      } catch(e) { res.writeHead(400); res.end(JSON.stringify({ error: { message: e.message } })); }
    });
    return;
  }


  // ── /api/profit-pilot  — network analytics protocol ──────────────────────
  if (pathname === '/api/profit-pilot') {
    try {
      const pp = require('./packages/profit-pilot/network.js');
      const appFolders = fs.readdirSync(APPS).filter(d => fs.existsSync(path.join(APPS,d,'index.html')));
      const deployed   = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT,'deployed-addresses.json'),'utf8')); } catch { return {}; } })();
      const contracts  = deployed?.rawnet_testnet || {};
      const live       = Object.entries(contracts).filter(([k,v])=>v&&v!=='pending'&&!k.startsWith('_')).length;
      const health     = pp.networkHealth(appFolders.length, live);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(health, null, 2));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── /health ────────────────────────────────────────────────────────────────
  if (pathname === '/health') {
    const appFolders = fs.readdirSync(APPS).filter(d => fs.existsSync(path.join(APPS, d, 'index.html')));
    const deployed = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT,'deployed-addresses.json'),'utf8')); } catch { return {}; } })();
    const contracts = deployed?.rawnet_testnet || {};
    const live = Object.entries(contracts).filter(([k,v])=>v&&v!=='pending'&&!k.startsWith('_')).length;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok', timestamp: new Date().toISOString(),
      apps: appFolders.length, uptime: Math.floor(process.uptime()),
      contracts: { live, total: Object.keys(contracts).filter(k=>!k.startsWith('_')).length, network: 'RAWNet Testnet (720701)' },
      sse: { clients: sseClients.size },
      node: process.version,
    }, null, 2));
    return;
  }

  // ── /manifest.json ─────────────────────────────────────────────────────────
  if (pathname === '/manifest.json') { serveFile(res, path.join(ROOT, 'manifest.json')); return; }

  // ── / root → rawagon-os (THE network OS) ─────────────────────────────────
  if (pathname === '/' || pathname === '') {
    serveFile(res, path.join(APPS, 'rawagon-os', 'index.html'));
    return;
  }

  // ── /apps/<name>[/file] ────────────────────────────────────────────────────
  if (parts[0] === 'apps' && parts[1]) {
    const folder = APP_MAP[parts[1]] || parts[1];
    const rest   = parts.slice(2).join('/') || 'index.html';
    const file   = path.join(APPS, folder, rest);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) { serveFile(res, file); return; }
    const idx = path.join(APPS, folder, 'index.html');
    if (fs.existsSync(idx)) { serveFile(res, idx); return; }
    res.writeHead(404); res.end('App not found: ' + folder); return;
  }

  // ── app alias redirect ─────────────────────────────────────────────────────
  if (APP_MAP[parts[0]]) {
    res.writeHead(302, { Location: '/apps/' + APP_MAP[parts[0]] + '/' });
    res.end(); return;
  }

  // ── static from repo root ──────────────────────────────────────────────────
  const file = path.join(ROOT, pathname);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) { serveFile(res, file); return; }

  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  const ifaces = require('os').networkInterfaces();
  const ips = Object.values(ifaces).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log(`\n⬡  RAWagon App Server v2`);
  console.log(`   Local:    http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`   Network:  http://${ip}:${PORT}`));
  console.log(`\n   Apps:`);
  try {
    fs.readdirSync(APPS).filter(d => fs.existsSync(path.join(APPS,d,'index.html'))).forEach(d => {
      const m = APP_META[d] || {};
      console.log(`   ${m.emoji||'·'} http://${ips[0]||'localhost'}:${PORT}/apps/${d}/`);
    });
  } catch {}
  console.log(`\n   API:`);
  console.log(`   ↳ http://${ips[0]||'localhost'}:${PORT}/health`);
  console.log(`   ↳ http://${ips[0]||'localhost'}:${PORT}/api/network-state`);
  console.log(`   ↳ http://${ips[0]||'localhost'}:${PORT}/api/events  (SSE)`);
  console.log(`   ↳ http://${ips[0]||'localhost'}:${PORT}/api/anthropic-proxy  (POST)`);
  console.log('');
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('   ✓ ANTHROPIC_API_KEY loaded — proxy active');
  } else {
    console.log('   · No ANTHROPIC_API_KEY in env — apps use browser key');
  }
  console.log('');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} in use. Try: node server.js ${PORT+1}`);
  else console.error(err);
  process.exit(1);
});

module.exports = server;
