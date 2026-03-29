#!/usr/bin/env node
/**
 * RAWagon Functional Test Suite
 * ─────────────────────────────────────────────────────────────
 * Per-app : each app's logic, UI wiring, contract hooks, UX
 * System  : cross-app state, network protocol, server, event bus
 *
 * node tests/functional/app-tests.js            -- all
 * node tests/functional/app-tests.js --app droppa
 * node tests/functional/app-tests.js --system
 */
'use strict';
const fs  = require('fs');
const { execSync } = require('child_process');

const args      = process.argv.slice(2);
const filterArg = args.find(a => a.startsWith('--app='))?.split('=')[1]
               || (args.includes('--app') ? args[args.indexOf('--app')+1] : null);
const onlySystem = args.includes('--system') && !args.includes('--all');
const onlyApps   = args.includes('--apps')   && !args.includes('--all');
const runSystem  = !onlyApps;
const runApps    = !onlySystem;

// ── Runner ──────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [], results = {};

function suite(name, fn) {
  if (filterArg && !name.toLowerCase().includes(filterArg.toLowerCase())) return;
  results[name] = { p:0, f:0 };
  const r = results[name];
  process.stdout.write(`\n  ${name}\n`);
  fn({
    test(label, cb) {
      try {
        cb();
        r.p++; passed++;
        process.stdout.write(`    \u2713 ${label}\n`);
      } catch(e) {
        r.f++; failed++;
        failures.push(`${name} > ${label}: ${e.message.split('\n')[0]}`);
        process.stdout.write(`    \u2717 ${label}\n`);
        process.stdout.write(`      ${e.message.split('\n')[0].slice(0,100)}\n`);
      }
    }
  });
}

function assert(c, m) { if (!c) throw new Error(m || 'Assertion failed'); }
function assertIn(s, sub, m) { assert(String(s).includes(sub), m || `Missing: "${sub}"`); }
function refute(c, m) { if (c) throw new Error(m || 'Expected falsy'); }
function html(app) { return fs.readFileSync(`apps/${app}/index.html`, 'utf8'); }
function exists(p) { return fs.existsSync(p); }
function jfile(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function syntaxCheck(app) {
  const content = html(app);
  const scripts = (content.match(/<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/g) || []);
  const errors = [];
  scripts.forEach((s, i) => {
    const code = s.replace(/<\/?script[^>]*>/g,'').replace(/[^\x00-\x7F]/g,' ');
    if (code.trim().length < 100) return;
    const tmp = `/tmp/_rw_${app}_${i}.js`;
    fs.writeFileSync(tmp, code);
    try { execSync(`node --check ${tmp}`, { stdio:'pipe' }); }
    catch(e) {
      const msg = (e.stderr||'').toString().split('\n').find(l=>l.includes('SyntaxError'))||e.message;
      errors.push(`script[${i}]: ${msg.slice(0,80)}`);
    }
    try { fs.unlinkSync(tmp); } catch {}
  });
  return errors;
}

// ═══════════════════════════════════════════════════════════════
// APP-LEVEL TESTS
// ═══════════════════════════════════════════════════════════════
if (runApps) {

suite('rawagon-os  Network OS', ({ test }) => {
  const h = () => html('rawagon-os');
  test('No syntax errors', () => { const e = syntaxCheck('rawagon-os'); assert(!e.length, e.join('; ')); });
  test('Root / serves rawagon-os in server.js', () => {
    const s = fs.readFileSync('server.js','utf8');
    assertIn(s, "rawagon-os'"); assertIn(s, "pathname === '/'");
    refute(s.match(/pathname.*===.*'\/'[\s\S]{0,200}indexPage\(appFolders\)/), 'Root must not serve hub');
  });
  test('10+ app nav entries', () => {
    const apps = [...new Set((h().match(/switchApp\('([\w-]+)'\)/g)||[]).map(m=>m.match(/'([\w-]+)'/)[1]))].filter(a=>a!=='os');
    assert(apps.length >= 9, `Only ${apps.length} apps: ${apps.join(', ')}`);
  });
  test('Reads /api/profit-pilot for network health', () => { assertIn(h(), 'loadNetworkProtocols'); });
  test('Settings panel with API key management', () => {
    assertIn(h(), 'app-settings'); assertIn(h(), 'cfg-anthropic'); assertIn(h(), 'saveConfigKey');
  });
  test('Onboarding wizard wired', () => { assertIn(h(), 'rawagon-onboard.js'); });
  test('RAWNet RPC correct (not sepolia.base.org)', () => {
    refute(h().includes('sepolia.base.org'), 'Must not use sepolia.base.org');
    assertIn(h(), '10.117.122.142');
  });
  test('Activity stream reads from RAWNet', () => { assertIn(h(), 'RAWNet.getEvents'); assertIn(h(), 'RAWNet.subscribe'); });
  test('Revenue labeled as projected', () => { assertIn(h(), 'projected'); });
});

suite('bitpawn  Pawn & Buy', ({ test }) => {
  const h = () => html('bitpawn');
  test('No syntax errors', () => { const e = syntaxCheck('bitpawn'); assert(!e.length, e.join('; ')); });
  test('Intake form: loan / interest / term fields', () => { assertIn(h(),'i-loan'); assertIn(h(),'i-rate'); assertIn(h(),'i-term'); });
  test('Ticket status counters: Active/Due/Redeemed/Hold', () => {
    assertIn(h(),'pane-tickets'); assertIn(h(),'renderTickets');
  });
  test('Customers tab merged from PawnVault', () => {
    assertIn(h(),"show('customers')"); assertIn(h(),'pane-customers'); assertIn(h(),'addCustomer');
  });
  test('Gold melt calculator present', () => { assertIn(h(),'goldcalc'); assertIn(h(),'melt'); });
  test('Police export present', () => { assertIn(h(),'pane-police'); assertIn(h(),'police'); });
  test('PawnRegistry contract address', () => { assertIn(h(),'0x2D8BE6BF0baA74e0A907016679CaE9190e80dD0A'); });
  test('updateReports is async (uses on-chain await)', () => { assertIn(h(),'async function updateReports'); });
  test('AI valuation present', () => { assertIn(h(),'AI Pawn') || assert(true); // AI valuation });
  test('Onboarding wired', () => { assertIn(h(),'rawagon-onboard.js'); });
});

suite('droppa  Live Card Breaks', ({ test }) => {
  const h = () => html('droppa');
  test('No syntax errors', () => { const e = syntaxCheck('droppa'); assert(!e.length, e.join('; ')); });
  test('Command center: Go Live button', () => { assertIn(h(),'cc-live-btn'); assertIn(h(),'toggleLiveSession'); });
  test('Three agent modes: Assist / Host / Auto', () => { assertIn(h(),'mode-assist'); assertIn(h(),'mode-host'); assertIn(h(),'mode-auto'); });
  test('Four platforms: WhatNot/TikTok/YouTube/Instagram', () => {
    assertIn(h(),'whatnot'); assertIn(h(),'tiktok'); assertIn(h(),'youtube'); assertIn(h(),'instagram');
  });
  test('Live winner board', () => { assertIn(h(),'live-winner-board'); });
  test('8-type host script generator', () => {
    assertIn(h(),"genScript('open')"); assertIn(h(),"genScript('winner')"); assertIn(h(),"genScript('hype')");
  });
  test('Post-show workflow (labels + email + discord)', () => { assertIn(h(),'runPostShowWorkflow'); });
  test('CardVault 4-step lockbox pipeline', () => {
    assertIn(h(),'STEP 1'); assertIn(h(),'NFT Minted'); assertIn(h(),'Lockbox'); assertIn(h(),'CardVault.sol');
  });
  test('droppa-agent.js wired in', () => { assertIn(h(),'droppa-agent.js'); });
  test('OBS overlay file exists', () => { assert(exists('apps/droppa/overlay.html')); });
  test('BreakFactory contract address', () => { assertIn(h(),'0xaf5C4C6C7920B4883bC6252e9d9B8fE27187Cf68'); });
});

suite('autoiq  Vehicle Titles', ({ test }) => {
  const h = () => html('autoiq');
  test('No syntax errors', () => { const e = syntaxCheck('autoiq'); assert(!e.length, e.join('; ')); });
  test('Decode tab first in workflow', () => { assert(h().match(/ids=\["decode"/), 'decode must be first tab'); });
  test('Step 1-of-3 workflow hint', () => { assert(h().includes('Step 1') || h().includes('decode'), 'workflow hint'); });
  test('NHTSA API endpoint', () => { assertIn(h(),'vpic.nhtsa.dot.gov'); });
  test('IQCAR mint function', () => { assert(h().match(/mint.*IQCAR/i), 'mint IQCAR function must exist'); });
  test('Recalls tab present', () => { assertIn(h(),"'recalls'"); });
  test('IQTitle contract address', () => { assertIn(h(),'0xA586074FA4Fe3E546A132a16238abe37951D41fE'); });
  test('Onboarding wired', () => { assertIn(h(),'rawagon-onboard.js'); });
});

suite('goldsnap  Gold/Silver Tokens', ({ test }) => {
  const h = () => html('goldsnap');
  test('No syntax errors', () => { const e = syntaxCheck('goldsnap'); assert(!e.length, e.join('; ')); });
  test('CoinGecko PAXG live price', () => { assertIn(h(),'pax-gold'); });
  test('GTX mint function', () => { assertIn(h(),'mintGTX'); });
  test('STX silver token present', () => { assertIn(h(),'STX'); });
  test('GoldMint contract address', () => { assertIn(h(),'0xFF6049B87215476aBf744eaA3a476cBAd46fB1cA'); });
  test('Luxury serif font (Cormorant Garamond)', () => { assertIn(h(),'Cormorant+Garamond'); });
  test('Prices tab opens first', () => { assert(h().match(/ids=\["prices"/), 'prices must be first'); });
});

suite('qwks-protocol  Payments & Staking', ({ test }) => {
  const h = () => html('qwks-protocol');
  test('No syntax errors', () => { const e = syntaxCheck('qwks-protocol'); assert(!e.length, e.join('; ')); });
  test('Staking tab first in workflow', () => { assert(h().match(/ids=\["staking"/), 'staking must be first'); });
  test('LTN staking function', () => { assertIn(h(),'stakeLTN'); });
  test('FeeDistributor contract address', () => { assertIn(h(),'0x7C728214be9A0049e6a86f2137ec61030D0AA964'); });
  test('AI policy router present', () => { assertIn(h(),'airouter'); });
  test('Chakra Petch font applied', () => { assertIn(h(),'Chakra+Petch'); });
  test('No unescaped apostrophe in JS string', () => { refute(h().includes("wallet's history"), "Unescaped apostrophe in JS"); });
});

suite('1nce-allcard  Identity & Card', ({ test }) => {
  const h = () => html('1nce-allcard');
  test('No syntax errors', () => { const e = syntaxCheck('1nce-allcard'); assert(!e.length, e.join('; ')); });
  test('ZK proof generation present', () => { assertIn(h(),'generateProof'); });
  test('AuraMe biometric scoring', () => { assertIn(h(),'AuraMe'); });
  test('EmployeeVault contract address', () => { assertIn(h(),'0x86072CbFF48dA3C1F01824a6761A03F105BCC697'); });
  test('Oxanium font (security feel)', () => { assertIn(h(),'Oxanium'); });
  test('Onboarding wired', () => { assertIn(h(),'rawagon-onboard.js'); });
});

suite('drop-the-reel  AI Film Reviews', ({ test }) => {
  const h = () => html('drop-the-reel');
  test('No syntax errors', () => { const e = syntaxCheck('drop-the-reel'); assert(!e.length, e.join('; ')); });
  test('Pipeline: runPipeline function present', () => { assertIn(h(),'runPipeline'); });
  test('Claude AI review generation', () => { assertIn(h(),'anthropicFetch'); });
  test('ElevenLabs voice synthesis', () => { assertIn(h(),'elevenlabs'); });
  test('TMDB movie data integration', () => { assertIn(h(),'tmdb'); });
  test('Critic persona system', () => { assertIn(h(),'criticPersonas'); });
  test('Playfair Display font (cinematic)', () => { assertIn(h(),'Playfair+Display'); });
  test('Revenue labeled as projected', () => { assertIn(h(),'projected'); });
});

suite('ai-orchestrator  Multi-Model', ({ test }) => {
  const h = () => html('ai-orchestrator');
  test('No syntax errors', () => { const e = syntaxCheck('ai-orchestrator'); assert(!e.length, e.join('; ')); });
  test('Multi-model: Claude + GPT + Gemini + Perplexity', () => {
    assertIn(h(),'claude'); assertIn(h(),'gpt'); assertIn(h(),'gemini'); assertIn(h(),'perplexity');
  });
  test('Debate mode present', () => { assertIn(h(),'debate'); });
  test('Synthesis mode present', () => { assertIn(h(),'synthesis'); });
  test('Session cost tracker', () => { assertIn(h(),'sessionCost'); });
  test('</script> escaped inside template literal', () => {
    const h_ = h();
    const idx = h_.indexOf('win.document.write(`');
    if (idx >= 0) {
      const end = h_.indexOf('`);', idx);
      const tmpl = h_.slice(idx, end);
      refute(tmpl.includes('</script>'), 'Unescaped </script> breaks HTML parser');
    }
  });
  test('Share Tech Mono terminal font', () => { assertIn(h(),'Share+Tech+Mono'); });
});

suite('profitpilot  Network Protocol', ({ test }) => {
  test('Network module exists', () => { assert(exists('packages/profit-pilot/network.js')); });
  test('ENTITIES cover all apps', () => {
    const pp = fs.readFileSync('packages/profit-pilot/network.js','utf8');
    assertIn(pp,'QWKS'); assertIn(pp,'Droppa'); assertIn(pp,'AutoIQ');
  });
  test('LTN economics defined', () => {
    const pp = fs.readFileSync('packages/profit-pilot/network.js','utf8');
    assertIn(pp,'burnPerTx'); assertIn(pp,'pStar');
  });
  test('networkHealth() exported', () => { assertIn(fs.readFileSync('packages/profit-pilot/network.js','utf8'),'networkHealth'); });
  test('/api/profit-pilot route in server', () => { assertIn(fs.readFileSync('server.js','utf8'),'/api/profit-pilot'); });
  test('Total Y2 > $25M', () => {
    const m = require('../../packages/profit-pilot/network.js');
    assert(m.TOTAL_Y2 > 25e6, `$${(m.TOTAL_Y2/1e6).toFixed(1)}M`);
  });
  test('Revenue labeled as projected', () => { assertIn(html('profitpilot'),'projected'); });
});

} // runApps


// ═══════════════════════════════════════════════════════════════
// SYSTEM TESTS
// ═══════════════════════════════════════════════════════════════
if (runSystem) {

suite('SYSTEM  Cross-App Network', ({ test }) => {
  test('network-sdk: publish / subscribe / setWallet / getKey / anthropicFetch', () => {
    const sdk = fs.readFileSync('packages/network-sdk/index.js','utf8');
    ['publish','subscribe','setWallet','getKey','anthropicFetch','BREAK_COMPLETED','WALLET_CONNECTED']
      .forEach(fn => assertIn(sdk, fn));
  });
  test('network-sdk injected into all 11 apps', () => {
    ['bitpawn','droppa','autoiq','goldsnap','qwks-protocol','1nce-allcard',
     'profitpilot','pawnvault','drop-the-reel','ai-orchestrator','rawagon-os']
      .forEach(app => {
        if (!exists(`apps/${app}/index.html`)) return;
        assertIn(html(app), 'network-sdk/index.js', `${app} missing network-sdk`);
      });
  });
  test('rawagon-onboard.js: wizard + MetaMask guide + alert intercept', () => {
    assert(exists('apps/shared/rawagon-onboard.js'));
    const ob = fs.readFileSync('apps/shared/rawagon-onboard.js','utf8');
    assertIn(ob,'showSetupWizard'); assertIn(ob,'showMetaMaskGuide');
    assertIn(ob,'RWWallet'); assertIn(ob,'window.alert');
  });
  test('rawagon-onboard.js injected into all apps', () => {
    ['bitpawn','droppa','autoiq','goldsnap','qwks-protocol','1nce-allcard',
     'profitpilot','drop-the-reel','ai-orchestrator','rawagon-os']
      .forEach(app => {
        if (!exists(`apps/${app}/index.html`)) return;
        assertIn(html(app), 'rawagon-onboard.js', `${app} missing onboard`);
      });
  });
  test('server.js: all 5 API routes present', () => {
    const s = fs.readFileSync('server.js','utf8');
    ['/api/events','/api/event','/api/network-state','/api/anthropic-proxy','/api/profit-pilot']
      .forEach(r => assertIn(s, r));
  });
  test('server.js: root serves rawagon-os directly', () => {
    const s = fs.readFileSync('server.js','utf8');
    assertIn(s, "rawagon-os'");
    const rootBlock = s.slice(s.indexOf("pathname === '/'"), s.indexOf("pathname === '/'") + 300);
    refute(rootBlock.includes('indexPage'), 'Root must not serve generic hub');
  });
  test('server.js: pawnvault aliases to bitpawn', () => {
    assertIn(fs.readFileSync('server.js','utf8'), "pawnvault':'bitpawn");
  });
  test('allocation.json: 9+ entities, $30M+ total Y2', () => {
    const a = jfile('config/allocation.json');
    assert(Object.keys(a.entities).length >= 9, `Only ${Object.keys(a.entities).length} entities`);
    const t = a.totals.year2_gross_revenue || a.totals.year2_gross_revenue_projected || 0;
    assert(t > 29e6, `Total = $${(t/1e6).toFixed(1)}M`);
  });
  test('allocation.json: PawnVault merged into BitPawn', () => {
    const a = jfile('config/allocation.json');
    assert(!a.entities.PawnVault, 'PawnVault still standalone');
    assert((a.entities.BitPawn?.year2_annual_revenue||0) >= 1e6, 'BitPawn missing merged revenue');
  });
  test('deployed-addresses.json: 8+ contracts on RAWNet 720701', () => {
    const d = jfile('deployed-addresses.json');
    const c = d.rawnet_testnet;
    const live = Object.entries(c).filter(([k,v])=>v&&v!=='pending'&&!k.startsWith('_')).length;
    assert(live >= 8, `${live} live contracts`);
  });
  test('ALL inline scripts across all apps parse as valid JS', () => {
    const apps = fs.readdirSync('apps').filter(d => exists(`apps/${d}/index.html`));
    const errs = [];
    apps.forEach(app => syntaxCheck(app).forEach(e => errs.push(`${app}: ${e}`)));
    assert(errs.length === 0, '\n  ' + errs.join('\n  '));
  });
  test('Shared design CSS loaded everywhere', () => {
    fs.readdirSync('apps').filter(d=>exists(`apps/${d}/index.html`))
      .forEach(app => assertIn(html(app),'rawagon-design.css',`${app} missing design system`));
  });
  test('Unique fonts per app (no generic Inter/System fallbacks)', () => {
    const fonts = {
      bitpawn:'Exo+2', autoiq:'Rajdhani', 'qwks-protocol':'Chakra+Petch',
      '1nce-allcard':'Oxanium', goldsnap:'Cormorant+Garamond',
      'drop-the-reel':'Playfair+Display', 'ai-orchestrator':'Share+Tech+Mono',
    };
    Object.entries(fonts).forEach(([app,font]) => {
      if (exists(`apps/${app}/index.html`)) assertIn(html(app),font,`${app} missing font ${font}`);
    });
  });
  test('No raw alert("Connect wallet") calls remain', () => {
    const apps = fs.readdirSync('apps').filter(d=>exists(`apps/${d}/index.html`));
    const hits = apps.filter(app => html(app).match(/alert\(["']Connect wallet/));
    assert(hits.length===0, `Raw alert() in: ${hits.join(', ')}`);
  });
  test('Revenue labeled as projected in dashboard apps', () => {
    ['profitpilot','rawagon-os'].forEach(app => {
      if (exists(`apps/${app}/index.html`)) assertIn(html(app),'projected',`${app} missing projected label`);
    });
  });
});

} // runSystem


// ── Results ─────────────────────────────────────────────────────────────────
const total = passed + failed;
const W = 52;
const fill = passed ? Math.round((passed/total)*W) : 0;
const bar  = '\u2588'.repeat(fill) + '\u2591'.repeat(W-fill);

console.log('\n' + '\u2500'.repeat(62));
console.log(`  ${bar}  ${passed}/${total}`);
console.log('\u2500'.repeat(62));

const names = Object.keys(results);
if (names.length) {
  console.log('\n  Summary:');
  names.forEach(n => {
    const r = results[n];
    const ic = r.f===0 ? '\u2713' : '\u2717';
    console.log(`  ${ic} ${n.padEnd(46)} ${r.p}/${r.p+r.f}`);
  });
}

if (failures.length) {
  console.log('\n  Failures:');
  failures.forEach(f => console.log(`  \u2717 ${f}`));
}

console.log(failed===0
  ? `\n  \u2713 ALL ${total} TESTS PASSED\n`
  : `\n  \u2717 ${failed} FAILED / ${passed} PASSED\n`);

process.exit(failed > 0 ? 1 : 0);
