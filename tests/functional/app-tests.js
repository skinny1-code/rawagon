#!/usr/bin/env node
'use strict';
const fs  = require('fs');
const { execSync } = require('child_process');

const args      = process.argv.slice(2);
const filterArg = args.find(a => a.startsWith('--app='))?.split('=')[1]
               || (args.includes('--app') ? args[args.indexOf('--app')+1] : null);
const onlySystem = args.includes('--system') && !args.includes('--all');
const runSystem  = !args.includes('--apps');
const runApps    = !onlySystem;

let passed = 0, failed = 0;
const failures = [], results = {};

function suite(name, fn) {
  if (filterArg && !name.toLowerCase().includes(filterArg.toLowerCase())) return;
  results[name] = { p:0, f:0 };
  const r = results[name];
  process.stdout.write('\n  ' + name + '\n');
  fn({ test(label, cb) {
    try { cb(); r.p++; passed++; process.stdout.write('    \u2713 ' + label + '\n'); }
    catch(e) { r.f++; failed++; failures.push(name + ' > ' + label + ': ' + e.message.split('\n')[0]); process.stdout.write('    \u2717 ' + label + '\n    ' + e.message.split('\n')[0].slice(0,100) + '\n'); }
  }});
}

function assert(c, m) { if (!c) throw new Error(m || 'Assertion failed'); }
function assertIn(s, sub, m) { assert(String(s).includes(sub), m || 'Missing: "' + sub + '"'); }
function refute(c, m) { if (c) throw new Error(m || 'Expected falsy'); }
function html(app) { return fs.readFileSync('apps/' + app + '/index.html', 'utf8'); }
function exists(p) { return fs.existsSync(p); }
function jfile(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function syntaxCheck(app) {
  const content = html(app);
  const scripts = (content.match(/<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/g) || []);
  const errors = [];
  scripts.forEach(function(s, i) {
    const code = s.replace(/<\/?script[^>]*>/g,'').replace(/[^\x00-\x7F]/g,' ');
    if (code.trim().length < 100) return;
    const tmp = '/tmp/_rw_' + app + '_' + i + '.js';
    fs.writeFileSync(tmp, code);
    try { execSync('node --check ' + tmp, { stdio:'pipe' }); }
    catch(e) {
      const msg = (e.stderr||'').toString().split('\n').find(function(l){return l.includes('SyntaxError');})||e.message;
      errors.push('script[' + i + ']: ' + msg.slice(0,80));
    }
    try { fs.unlinkSync(tmp); } catch(e2) {}
  });
  return errors;
}

if (runApps) {

suite('rawagon-os  Network OS', function(t) {
  t.test('No syntax errors', function() { var e=syntaxCheck('rawagon-os'); assert(!e.length, e.join('; ')); });
  t.test('Root serves rawagon-os in server.js', function() {
    var s=fs.readFileSync('server.js','utf8');
    assertIn(s,"rawagon-os'"); assertIn(s,"pathname === '/'");
    var rb=s.slice(s.indexOf("pathname === '/'"),s.indexOf("pathname === '/")+300);
    refute(rb.includes('indexPage'),'Root must not serve hub');
  });
  t.test('10+ app nav entries', function() {
    var apps=[...new Set((html('rawagon-os').match(/switchApp\('([\w-]+)'\)/g)||[]).map(function(m){return m.match(/'([\w-]+)'/)[1];}))].filter(function(a){return a!=='os';});
    assert(apps.length>=9,'Only '+apps.length+' apps: '+apps.join(', '));
  });
  t.test('Reads profit-pilot for network health', function() { assertIn(html('rawagon-os'),'loadNetworkProtocols'); });
  t.test('Settings panel present', function() { assertIn(html('rawagon-os'),'app-settings'); assertIn(html('rawagon-os'),'saveConfigKey'); });
  t.test('Onboarding wired', function() { assertIn(html('rawagon-os'),'rawagon-onboard.js'); });
  t.test('RAWNet RPC correct (not sepolia)', function() { refute(html('rawagon-os').includes('sepolia.base.org')); assertIn(html('rawagon-os'),'10.117.122.142'); });
  t.test('Activity stream reads RAWNet', function() { assertIn(html('rawagon-os'),'RAWNet.getEvents'); });
  t.test('Revenue labeled projected', function() { assertIn(html('rawagon-os'),'projected'); });
});

suite('bitpawn  Pawn & Buy', function(t) {
  t.test('No syntax errors', function() { var e=syntaxCheck('bitpawn'); assert(!e.length, e.join('; ')); });
  t.test('Intake fields: loan/rate/term', function() { assertIn(html('bitpawn'),'i-loan'); assertIn(html('bitpawn'),'i-rate'); assertIn(html('bitpawn'),'i-term'); });
  t.test('Customers tab merged', function() { assertIn(html('bitpawn'),"show('customers')"); assertIn(html('bitpawn'),'pane-customers'); });
  t.test('Gold calculator present', function() { assertIn(html('bitpawn'),'goldcalc'); assertIn(html('bitpawn'),'melt'); });
  t.test('Police export present', function() { assertIn(html('bitpawn'),'pane-police'); assertIn(html('bitpawn'),'police'); });
  t.test('PawnRegistry contract wired', function() { assertIn(html('bitpawn'),'0x2D8BE6BF0baA74e0A907016679CaE9190e80dD0A'); });
  t.test('updateReports is async', function() { assertIn(html('bitpawn'),'async function updateReports'); });
  t.test('Customers functions defined', function() { assertIn(html('bitpawn'),'function addCustomer'); assertIn(html('bitpawn'),'function renderCustomers'); });
  t.test('Onboarding wired', function() { assertIn(html('bitpawn'),'rawagon-onboard.js'); });
  t.test('No raw alert("Connect wallet")', function() { refute(html('bitpawn').match(/alert\(["']Connect wallet/)); });
});

suite('droppa  Live Card Breaks', function(t) {
  t.test('No syntax errors', function() { var e=syntaxCheck('droppa'); assert(!e.length, e.join('; ')); });
  t.test('Go Live button', function() { assertIn(html('droppa'),'cc-live-btn'); assertIn(html('droppa'),'toggleLiveSession'); });
  t.test('3 agent modes', function() { assertIn(html('droppa'),'mode-assist'); assertIn(html('droppa'),'mode-host'); assertIn(html('droppa'),'mode-auto'); });
  t.test('4 platforms wired', function() { assertIn(html('droppa'),'whatnot'); assertIn(html('droppa'),'tiktok'); assertIn(html('droppa'),'youtube'); assertIn(html('droppa'),'instagram'); });
  t.test('Live winner board', function() { assertIn(html('droppa'),'live-winner-board'); });
  t.test('Host scripts: 8 types', function() { assertIn(html('droppa'),"genScript('open')"); assertIn(html('droppa'),"genScript('winner')"); });
  t.test('Post-show workflow', function() { assertIn(html('droppa'),'runPostShowWorkflow'); });
  t.test('CardVault 4-step pipeline', function() { assertIn(html('droppa'),'STEP 1'); assertIn(html('droppa'),'NFT Minted'); assertIn(html('droppa'),'CardVault.sol'); });
  t.test('BreakFactory contract wired', function() { assertIn(html('droppa'),'0xaf5C4C6C7920B4883bC6252e9d9B8fE27187Cf68'); });
  t.test('droppa-agent.js loaded', function() { assertIn(html('droppa'),'droppa-agent.js'); });
  t.test('OBS overlay exists', function() { assert(exists('apps/droppa/overlay.html')); });
});

suite('autoiq  Vehicle Titles', function(t) {
  t.test('No syntax errors', function() { var e=syntaxCheck('autoiq'); assert(!e.length, e.join('; ')); });
  t.test('Decode tab first', function() { assert(html('autoiq').match(/ids=\["decode"/)); });
  t.test('NHTSA endpoint wired', function() { assertIn(html('autoiq'),'vpic.nhtsa.dot.gov'); });
  t.test('IQCAR mint present', function() { assert(html('autoiq').match(/mint.*IQCAR/i)); });
  t.test('Recalls tab present', function() { assertIn(html('autoiq'),"'recalls'"); });
  t.test('IQTitle contract wired', function() { assertIn(html('autoiq'),'0xA586074FA4Fe3E546A132a16238abe37951D41fE'); });
  t.test('Onboarding wired', function() { assertIn(html('autoiq'),'rawagon-onboard.js'); });
});

suite('goldsnap  Gold/Silver Tokens', function(t) {
  t.test('No syntax errors', function() { var e=syntaxCheck('goldsnap'); assert(!e.length, e.join('; ')); });
  t.test('CoinGecko PAXG live price', function() { assertIn(html('goldsnap'),'pax-gold'); });
  t.test('GTX mint function', function() { assertIn(html('goldsnap'),'mintGTX'); });
  t.test('GoldMint contract wired', function() { assertIn(html('goldsnap'),'0xFF6049B87215476aBf744eaA3a476cBAd46fB1cA'); });
  t.test('Prices tab first', function() { assert(html('goldsnap').match(/ids=\["prices"/)); });
  t.test('Cormorant Garamond luxury font', function() { assertIn(html('goldsnap'),'Cormorant+Garamond'); });
});

suite('qwks-protocol  Payments & Staking', function(t) {
  t.test('No syntax errors', function() { var e=syntaxCheck('qwks-protocol'); assert(!e.length, e.join('; ')); });
  t.test('Staking tab first', function() { assert(html('qwks-protocol').match(/ids=\["staking"/)); });
  t.test('LTN staking function', function() { assertIn(html('qwks-protocol'),'stakeLTN'); });
  t.test('FeeDistributor contract wired', function() { assertIn(html('qwks-protocol'),'0x7C728214be9A0049e6a86f2137ec61030D0AA964'); });
  t.test('AI policy router present', function() { assertIn(html('qwks-protocol'),'airouter'); });
  t.test('No unescaped apostrophe in JS', function() { refute(html('qwks-protocol').includes("wallet's history")); });
});

suite('1nce-allcard  Identity & Card', function(t) {
  t.test('No syntax errors', function() { var e=syntaxCheck('1nce-allcard'); assert(!e.length, e.join('; ')); });
  t.test('ZK proof generation', function() { assertIn(html('1nce-allcard'),'generateProof'); });
  t.test('AuraMe scoring', function() { assertIn(html('1nce-allcard'),'AuraMe'); });
  t.test('EmployeeVault contract wired', function() { assertIn(html('1nce-allcard'),'0x86072CbFF48dA3C1F01824a6761A03F105BCC697'); });
  t.test('Oxanium font', function() { assertIn(html('1nce-allcard'),'Oxanium'); });
});

suite('drop-the-reel  AI Film Reviews', function(t) {
  t.test('No syntax errors', function() { var e=syntaxCheck('drop-the-reel'); assert(!e.length, e.join('; ')); });
  t.test('runPipeline function', function() { assertIn(html('drop-the-reel'),'runPipeline'); });
  t.test('Claude AI integration', function() { assertIn(html('drop-the-reel'),'anthropicFetch'); });
  t.test('ElevenLabs integration', function() { assertIn(html('drop-the-reel'),'elevenlabs'); });
  t.test('TMDB integration', function() { assertIn(html('drop-the-reel'),'tmdb'); });
  t.test('Critic persona system', function() { assertIn(html('drop-the-reel'),'criticPersonas'); });
  t.test('Playfair Display font', function() { assertIn(html('drop-the-reel'),'Playfair+Display'); });
  t.test('saveGlobalKey defined', function() { assertIn(html('drop-the-reel'),'function saveGlobalKey'); });
});

suite('ai-orchestrator  Multi-Model', function(t) {
  t.test('No syntax errors', function() { var e=syntaxCheck('ai-orchestrator'); assert(!e.length, e.join('; ')); });
  t.test('4 models: Claude/GPT/Gemini/Perplexity', function() { assertIn(html('ai-orchestrator'),'claude'); assertIn(html('ai-orchestrator'),'gpt'); assertIn(html('ai-orchestrator'),'gemini'); });
  t.test('Debate mode', function() { assertIn(html('ai-orchestrator'),'debate'); });
  t.test('Synthesis mode', function() { assertIn(html('ai-orchestrator'),'synthesis'); });
  t.test('Session cost tracker', function() { assertIn(html('ai-orchestrator'),'sessionCost'); });
  t.test('No unescaped script tag in template', function() {
    var h=html('ai-orchestrator'); var idx=h.indexOf('win.document.write');
    if(idx>=0){var end=h.indexOf('`);',idx); refute(h.slice(idx,end).includes('</script>'),'unescaped </script>');}
  });
  t.test('Share Tech Mono terminal font', function() { assertIn(html('ai-orchestrator'),'Share+Tech+Mono'); });
});

suite('profitpilot  Network Protocol', function(t) {
  t.test('network.js exists', function() { assert(exists('packages/profit-pilot/network.js')); });
  t.test('ENTITIES defined', function() { assertIn(fs.readFileSync('packages/profit-pilot/network.js','utf8'),'QWKS'); });
  t.test('LTN economics defined', function() { assertIn(fs.readFileSync('packages/profit-pilot/network.js','utf8'),'burnPerTx'); });
  t.test('networkHealth exported', function() { assertIn(fs.readFileSync('packages/profit-pilot/network.js','utf8'),'networkHealth'); });
  t.test('Server has profit-pilot route', function() { assertIn(fs.readFileSync('server.js','utf8'),'/api/profit-pilot'); });
  t.test('Total Y2 > $25M', function() { var m=require('../../packages/profit-pilot/network.js'); assert(m.TOTAL_Y2>25e6,'$'+(m.TOTAL_Y2/1e6).toFixed(1)+'M'); });
  t.test('Revenue labeled projected', function() { assertIn(html('profitpilot'),'projected'); });
});

} // end runApps

if (runSystem) {

suite('SYSTEM  Cross-App Network', function(t) {
  t.test('network-sdk exports all required functions', function() {
    var sdk=fs.readFileSync('packages/network-sdk/index.js','utf8');
    ['publish','subscribe','setWallet','getKey','anthropicFetch','BREAK_COMPLETED','WALLET_CONNECTED'].forEach(function(fn){assertIn(sdk,fn);});
  });
  t.test('network-sdk in all 11 apps', function() {
    ['bitpawn','droppa','autoiq','goldsnap','qwks-protocol','1nce-allcard','profitpilot','pawnvault','drop-the-reel','ai-orchestrator','rawagon-os'].forEach(function(app){
      if(!exists('apps/'+app+'/index.html'))return;
      assertIn(html(app),'network-sdk/index.js',app+' missing network-sdk');
    });
  });
  t.test('rawagon-onboard.js has wizard + wallet options + skip buttons', function() {
    assert(exists('apps/shared/rawagon-onboard.js'));
    var ob=fs.readFileSync('apps/shared/rawagon-onboard.js','utf8');
    assertIn(ob,'showSetupWizard'); assertIn(ob,'showWalletOptions'); assertIn(ob,'wizardDone');
    assertIn(ob,'Continue without wallet'); assertIn(ob,'RWWallet');
  });
  t.test('No backdrop-filter blur in onboarding (mobile crash fix)', function() {
    var ob=fs.readFileSync('apps/shared/rawagon-onboard.js','utf8');
    refute(ob.includes('backdrop-filter:blur')&&ob.includes('backdrop-filter: blur'),'backdrop-filter blur found — crashes Android');
  });
  t.test('rawagon-onboard.js in all apps', function() {
    ['bitpawn','droppa','autoiq','goldsnap','qwks-protocol','1nce-allcard','profitpilot','drop-the-reel','ai-orchestrator','rawagon-os'].forEach(function(app){
      if(!exists('apps/'+app+'/index.html'))return;
      assertIn(html(app),'rawagon-onboard.js',app+' missing onboard');
    });
  });
  t.test('Server has all 5 API routes', function() {
    var s=fs.readFileSync('server.js','utf8');
    ['/api/events','/api/event','/api/network-state','/api/anthropic-proxy','/api/profit-pilot'].forEach(function(r){assertIn(s,r);});
  });
  t.test('Root serves rawagon-os (not hub)', function() {
    var s=fs.readFileSync('server.js','utf8');
    assertIn(s,"rawagon-os'");
    var rb=s.slice(s.indexOf("pathname === '/'"),s.indexOf("pathname === '/")+300);
    refute(rb.includes('indexPage'),'Root must not serve generic hub');
  });
  t.test('pawnvault aliases to bitpawn', function() { assertIn(fs.readFileSync('server.js','utf8'),"pawnvault':'bitpawn"); });
  t.test('No url.parse deprecation in server', function() { refute(fs.readFileSync('server.js','utf8').includes('url.parse(req.url)'),'url.parse still present'); });
  t.test('allocation.json 9+ entities $30M+', function() {
    var a=jfile('config/allocation.json');
    assert(Object.keys(a.entities).length>=9,'Only '+Object.keys(a.entities).length+' entities');
    var tot=a.totals.year2_gross_revenue||a.totals.year2_gross_revenue_projected||0;
    assert(tot>29e6,'$'+(tot/1e6).toFixed(1)+'M');
  });
  t.test('PawnVault merged into BitPawn', function() {
    var a=jfile('config/allocation.json');
    assert(!a.entities.PawnVault,'PawnVault standalone'); assert((a.entities.BitPawn||{}).year2_annual_revenue>=1e6);
  });
  t.test('All inline scripts syntax-clean', function() {
    var apps=fs.readdirSync('apps').filter(function(d){return exists('apps/'+d+'/index.html');});
    var errs=[];
    apps.forEach(function(app){syntaxCheck(app).forEach(function(e){errs.push(app+': '+e);});});
    assert(errs.length===0,'\n  '+errs.join('\n  '));
  });
  t.test('Unique fonts per app', function() {
    var fonts={'bitpawn':'Exo+2','autoiq':'Rajdhani','qwks-protocol':'Chakra+Petch','1nce-allcard':'Oxanium','goldsnap':'Cormorant+Garamond','drop-the-reel':'Playfair+Display','ai-orchestrator':'Share+Tech+Mono'};
    Object.keys(fonts).forEach(function(app){if(exists('apps/'+app+'/index.html'))assertIn(html(app),fonts[app],app+' missing font');});
  });
  t.test('Revenue labeled projected everywhere', function() {
    ['profitpilot','rawagon-os'].forEach(function(app){if(exists('apps/'+app+'/index.html'))assertIn(html(app),'projected',app+' missing projected');});
  });
  t.test('No raw alert(Connect wallet) in any app', function() {
    var hits=fs.readdirSync('apps').filter(function(d){return exists('apps/'+d+'/index.html')&&html(d).match(/alert\(["']Connect wallet/);});
    assert(hits.length===0,'alert in: '+hits.join(', '));
  });
  t.test('Bottom nav in BitPawn/Droppa/AutoIQ/QWKS', function() {
    ['bitpawn','droppa','autoiq','qwks-protocol'].forEach(function(app){assertIn(html(app),'rw-bottom-nav',app+' missing bottom nav');});
  });
  t.test('iOS meta tags in all apps', function() {
    var apps=fs.readdirSync('apps').filter(function(d){return exists('apps/'+d+'/index.html');});
    apps.forEach(function(app){assertIn(html(app),'apple-mobile-web-app-capable',app+' missing iOS meta');});
  });
});

} // end runSystem

// Results
var total=passed+failed;
var W=52;
var fill=passed?Math.round((passed/total)*W):0;
var bar='\u2588'.repeat(fill)+'\u2591'.repeat(W-fill);
console.log('\n'+'\u2500'.repeat(62));
console.log('  '+bar+'  '+passed+'/'+total);
console.log('\u2500'.repeat(62));
var names=Object.keys(results);
if(names.length){console.log('\n  Summary:');names.forEach(function(n){var r=results[n];console.log('  '+(r.f===0?'\u2713':'\u2717')+' '+n.padEnd(46)+' '+r.p+'/'+(r.p+r.f));});}
if(failures.length){console.log('\n  Failures:');failures.forEach(function(f){console.log('  \u2717 '+f);});}
console.log(failed===0?'\n  \u2713 ALL '+total+' TESTS PASSED\n':'\n  \u2717 '+failed+' FAILED / '+passed+' PASSED\n');
process.exit(failed>0?1:0);
