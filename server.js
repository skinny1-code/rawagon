#!/usr/bin/env node
/**
 * RAWagon App Server
 * Serves all 8 apps + static files on a single port.
 * Run: node server.js [port]  (default 3000)
 */
'use strict';
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const PORT  = parseInt(process.argv[2] || process.env.PORT || '3000', 10);
const ROOT  = __dirname;
const APPS  = path.join(ROOT, 'apps');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
};

// Friendly app name → folder mapping
const APP_MAP = {
  'rawagon-os':    'rawagon-os',
  'allcard':       '1nce-allcard',
  '1nce-allcard':  '1nce-allcard',
  'bitpawn':       'bitpawn',
  'droppa':        'droppa',
  'autoiq':        'autoiq',
  'goldsnap':      'goldsnap',
  'qwks':          'qwks-protocol',
  'qwks-protocol': 'qwks-protocol',
  'profitpilot':   'profitpilot',
};

function serveFile(res, filePath) {
  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found: ' + filePath);
  }
}

function indexPage(appFolders) {
  const cards = appFolders.map(name => {
    const emoji = {
      'rawagon-os':'⬡','1nce-allcard':'🪪','bitpawn':'🏦','droppa':'🎴',
      'autoiq':'🚗','goldsnap':'🥇','qwks-protocol':'⛓','profitpilot':'📊'
    }[name] || '●';
    const label = name.replace('1nce-','1.nce ').replace('-', ' ').replace(/\b\w/g,c=>c.toUpperCase());
    return `<a href="/apps/${name}/" class="card"><span class="icon">${emoji}</span><span class="label">${label}</span></a>`;
  }).join('\n    ');

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RAWagon — App Hub</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#07040f;color:#f0eaff;font-family:system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:40px 20px}
h1{font-size:2rem;font-weight:800;margin-bottom:6px;background:linear-gradient(135deg,#8b5cf6,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
p{color:#7c6a9a;font-size:.85rem;margin-bottom:32px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;width:100%;max-width:720px}
.card{background:#160d22;border:1px solid rgba(139,92,246,.2);border-radius:14px;padding:20px 14px;text-align:center;text-decoration:none;color:inherit;transition:.15s;display:flex;flex-direction:column;align-items:center;gap:8px}
.card:hover{border-color:#8b5cf6;background:#1e0f2e}
.icon{font-size:2rem}.label{font-size:.78rem;font-weight:600;color:#c4b5f5}
.footer{margin-top:40px;font-size:.72rem;color:#3d2d5a}
</style></head><body>
<h1>RAWagon</h1>
<p>RAWNet Testnet · chainId 720701 · RPC: 10.117.122.142:8545</p>
<div class="grid">
    ${cards}
</div>
<div class="footer">RAWagon Systems LLC · RAW-2026-PROV-001 · Patent Pending</div>
</body></html>`;
}

const server = http.createServer((req, res) => {
  const { pathname } = url.parse(req.url);
  const parts = pathname.split('/').filter(Boolean);

  // CORS for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Root → index
  if (pathname === '/' || pathname === '') {
    const appFolders = fs.readdirSync(APPS).filter(d =>
      fs.existsSync(path.join(APPS, d, 'index.html'))
    );
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(indexPage(appFolders));
    return;
  }

  // /apps/<name>[/...] OR /<alias>[/...]
  if (parts[0] === 'apps' && parts[1]) {
    const folder = APP_MAP[parts[1]] || parts[1];
    const rest   = parts.slice(2).join('/') || 'index.html';
    const file   = path.join(APPS, folder, rest);
    if (fs.existsSync(file)) { serveFile(res, file); return; }
    // Fallback to index.html for SPA-like routing
    const idx = path.join(APPS, folder, 'index.html');
    if (fs.existsSync(idx)) { serveFile(res, idx); return; }
    res.writeHead(404); res.end('App not found: '+folder); return;
  }

  // Shortcut /rawagon-os → /apps/rawagon-os/
  if (APP_MAP[parts[0]]) {
    res.writeHead(302, { Location: '/apps/' + (APP_MAP[parts[0]] || parts[0]) + '/' });
    res.end(); return;
  }

  // Static assets from repo root
  const file = path.join(ROOT, pathname);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    serveFile(res, file); return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  const ifaces = require('os').networkInterfaces();
  const ips = Object.values(ifaces).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log(`\n⬡  RAWagon App Server`);
  console.log(`   Local:    http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`   Network:  http://${ip}:${PORT}`));
  console.log(`\n   Apps:`);
  try {
    fs.readdirSync(APPS).filter(d => fs.existsSync(path.join(APPS,d,'index.html'))).forEach(d => {
      console.log(`   ↳ http://${ips[0]||'localhost'}:${PORT}/apps/${d}/`);
    });
  } catch {}
  console.log('');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} in use. Try: node server.js ${PORT+1}`);
  } else { console.error(err); }
  process.exit(1);
});
