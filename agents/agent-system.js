#!/usr/bin/env node
/**
 * R3WAGON Agent System
 * One autonomous agent per entity app.
 *
 * GUARDRAILS:
 *   - Max 50 lines changed per patch
 *   - Confidence >= 0.85 to auto-apply
 *   - Cannot change contract addresses
 *   - Cannot delete functions
 *   - All actions logged to agents/log/
 *   - Human approval queue for structural changes
 *   - 60s cooldown between actions per agent
 */
'use strict';
const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOG_DIR = path.join(__dirname, 'log');
fs.mkdirSync(LOG_DIR, { recursive: true });

const AGENTS = [
  { id:'bitpawn',   name:'BitPawn Agent',    emoji:'🏦', app:'apps/bitpawn/index.html',       contract:'contracts/BitPawn/PawnRegistry.sol', addr:'0x2D8BE6BF0baA74e0A907016679CaE9190e80dD0A', focus:'pawn ticket creation, ZK commitment, gold melt calculator, redeem flow' },
  { id:'goldsnap',  name:'GoldSnap Agent',   emoji:'🥇', app:'apps/goldsnap/index.html',      contract:'contracts/GoldSnap/GoldMint.sol',    addr:'0xFF6049B87215476aBf744eaA3a476cBAd46fB1cA', focus:'GTX/STX mint and redeem, oracle prices, portfolio, reserve audit, faucet' },
  { id:'droppa',    name:'Droppa Agent',     emoji:'🎴', app:'apps/droppa/index.html',        contract:'contracts/Droppa/BreakFactory.sol',  addr:'0xaf5C4C6C7920B4883bC6252e9d9B8fE27187Cf68', focus:'break creation, slot purchase, VRF completion, earnings, Card Vault intake/mint/redeem, vault marketplace, DCV NFT' },
  { id:'autoiq',    name:'AutoIQ Agent',     emoji:'🚗', app:'apps/autoiq/index.html',        contract:'contracts/AutoIQ/IQTitle.sol',       addr:'0xA586074FA4Fe3E546A132a16238abe37951D41fE', focus:'VIN decode NHTSA API, IQCAR mint, title transfer, recall lookup' },
  { id:'allcard',   name:'AllCard Agent',    emoji:'🪪', app:'apps/1nce-allcard/index.html',  contract:'contracts/AllCard/EmployeeVault.sol', addr:'0x86072CbFF48dA3C1F01824a6761A03F105BCC697', focus:'ZK identity, shifting PAN, 8 modes, employer enrollment' },
  { id:'qwks',      name:'QWKS Agent',       emoji:'⛓',  app:'apps/qwks-protocol/index.html', contract:'contracts/QWKS/FeeDistributor.sol',  addr:'0x7C728214be9A0049e6a86f2137ec61030D0AA964', focus:'fee routing, LTN staking, savings calculator, business onboarding' },
  { id:'profitpilot', name:'ProfitPilot Agent',  emoji:'📊', app:'apps/profitpilot/index.html',    contract:'contracts/Allocation/EntityAllocation.sol', addr:'0xaD888d0Ade988EbEe74B8D4F39BF29a8d0fe8A8D', focus:'entity revenue charts, LTN staking projections, compound calculator, IP vault, hardware tracker' },
  { id:'rawagonos', name:'R3WAGON OS Agent', emoji:'⬡',  app:'apps/rawagon-os/index.html',    contract:'contracts/LTN/LivingToken.sol',      addr:'0xaD888d0Ade988EbEe74B8D4F39BF29a8d0fe8A8D', focus:'OS navigation, LTN stats, wallet connect, app links' },
];

const GUARDRAILS = {
  MAX_LINE_DELTA: 50,
  MIN_CONFIDENCE: 0.85,
  COOLDOWN_MS: 60_000,
  MAX_PATCHES_PER_RUN: 3,
};

const state = {};
AGENTS.forEach(a => { state[a.id] = { lastRun: 0, issues: [], patches: 0, status: 'idle', health: 'good' }; });

function log(id, level, msg, data={}) {
  const entry = { ts: new Date().toISOString(), agent: id, level, msg, ...data };
  fs.appendFileSync(path.join(LOG_DIR, id+'.jsonl'), JSON.stringify(entry)+'\n');
  const icons = { info:'·', warn:'⚠', error:'✗', patch:'✓', block:'🚫' };
  console.log(`${icons[level]||'·'} [${id}] ${msg}`);
}

function guardrailCheck(original, patched, patch) {
  const issues = [];
  const delta = Math.abs(patched.split('\n').length - original.split('\n').length);
  if (delta > GUARDRAILS.MAX_LINE_DELTA) issues.push(`${delta} lines changed (max ${GUARDRAILS.MAX_LINE_DELTA})`);
  const origAddrs = (original.match(/0x[0-9a-fA-F]{40}/g)||[]);
  const newAddrs = (patched.match(/0x[0-9a-fA-F]{40}/g)||[]).filter(a => !origAddrs.includes(a));
  if (newAddrs.length) issues.push(`New addresses: ${newAddrs.join(',')}`);
  if (/ANTHROPIC_API_KEY|privateKey|mnemonic|WAGON_DEPLOYER/i.test(patched) && !/ANTHROPIC_API_KEY|privateKey|mnemonic|WAGON_DEPLOYER/i.test(original)) issues.push('Sensitive key detected');
  return { ok: issues.length===0, issues };
}

async function runAgent(agent) {
  const s = state[agent.id];
  if (Date.now() - s.lastRun < GUARDRAILS.COOLDOWN_MS) return;
  s.lastRun = Date.now();
  s.status = 'inspecting';

  const appPath = path.join(ROOT, agent.app);
  if (!fs.existsSync(appPath)) { s.status='idle'; return; }
  const appCode = fs.readFileSync(appPath, 'utf8');
  const contractPath = path.join(ROOT, agent.contract);
  const contractCode = fs.existsSync(contractPath) ? fs.readFileSync(contractPath, 'utf8') : '';

  log(agent.id, 'info', `Inspecting ${agent.app}`);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const SYSTEM = `You are ${agent.name}, an autonomous agent for the R3WAGON blockchain ecosystem.
Your role: inspect app code, find bugs or missing features, propose minimal surgical patches.

HARD GUARDRAILS:
- Max 50 lines changed per patch
- Never change contract addresses (live on R3NET testnet 720701)  
- Never delete existing functions
- Confidence must be >= 0.85 to propose a patch
- Only modify: ${agent.app}
- Focus: ${agent.focus}

Contract deployed at: ${agent.addr}

Respond ONLY with valid JSON:
{
  "health": "good|warning|error",
  "issues": ["description of issue 1"],
  "patches": [{
    "reason": "exactly what and why",
    "confidence": 0.90,
    "findText": "exact string to replace",
    "replaceWith": "replacement string",
    "linesAffected": 3,
    "humanApproval": false
  }],
  "summary": "one sentence"
}`;

  try {
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: 'user', content:
        `Inspect this app and its contract. Find real issues — don't invent problems.\n\nAPP (${agent.app}):\n\`\`\`html\n${appCode.slice(0,6000)}\`\`\`\n\nCONTRACT:\n\`\`\`solidity\n${contractCode.slice(0,2000)}\`\`\``
      }],
    });

    const raw = resp.content[0].text;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) { log(agent.id,'warn','No JSON in response'); s.status='idle'; return; }
    const result = JSON.parse(match[0]);

    s.health = result.health || 'good';
    s.issues = result.issues || [];
    log(agent.id, 'info', `${result.health?.toUpperCase()} — ${result.summary}`, { issues: s.issues.length });

    let patchCount = 0;
    for (const patch of (result.patches || []).slice(0, GUARDRAILS.MAX_PATCHES_PER_RUN)) {
      if (!patch.findText || !patch.replaceWith) continue;
      if (patch.confidence < GUARDRAILS.MIN_CONFIDENCE) {
        log(agent.id, 'warn', `Low confidence (${patch.confidence}) skipped: ${patch.reason}`);
        continue;
      }
      if (patch.humanApproval) {
        const pf = path.join(LOG_DIR, `${agent.id}-pending.json`);
        const pending = fs.existsSync(pf) ? JSON.parse(fs.readFileSync(pf)) : [];
        pending.push({ ...patch, ts: new Date().toISOString(), agent: agent.id });
        fs.writeFileSync(pf, JSON.stringify(pending, null, 2));
        log(agent.id, 'warn', `Queued for approval: ${patch.reason}`);
        continue;
      }

      const current = fs.readFileSync(appPath, 'utf8');
      if (!current.includes(patch.findText)) {
        log(agent.id, 'warn', `Text not found: "${patch.findText.slice(0,40)}..."`);
        continue;
      }

      const patched = current.replace(patch.findText, patch.replaceWith);
      const check = guardrailCheck(current, patched, patch);
      if (!check.ok) {
        log(agent.id, 'block', `Blocked: ${check.issues.join(' | ')}`);
        continue;
      }

      // Backup + apply
      fs.writeFileSync(path.join(LOG_DIR, `${agent.id}-${Date.now()}.bak`), current);
      fs.writeFileSync(appPath, patched);
      s.patches++;
      patchCount++;
      log(agent.id, 'patch', `Applied (${patch.confidence}): ${patch.reason}`);
    }

    if (patchCount > 0) log(agent.id, 'info', `Applied ${patchCount} patch(es)`);

  } catch(e) {
    log(agent.id, 'error', `Failed: ${e.message.split('\n')[0]}`);
  }

  s.status = 'idle';
}

function dashboard() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  R3WAGON Agent System                            ║');
  console.log('╚══════════════════════════════════════════════════╝');
  AGENTS.forEach(a => {
    const s = state[a.id];
    const hIcon = s.health==='good'?'✓':s.health==='warning'?'⚠':'✗';
    const since = s.lastRun ? `${Math.round((Date.now()-s.lastRun)/1000)}s ago` : 'pending';
    console.log(`  ${hIcon} ${a.emoji} ${a.name.padEnd(18)} ${s.status.padEnd(12)} issues:${s.issues.length} patches:${s.patches} ${since}`);
    s.issues.slice(0,1).forEach(i => console.log(`       ↳ ${i.slice(0,60)}`));
  });
  console.log('\n  Guardrails: 50 lines max · 0.85 confidence · 60s cooldown · no addr changes');
  console.log(`  Log dir: agents/log/`);
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Set ANTHROPIC_API_KEY first:\nexport ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }
  console.log('R3WAGON Agent System — 7 entity agents starting');
  // Stagger first runs
  AGENTS.forEach((a, i) => { state[a.id].lastRun = Date.now() - GUARDRAILS.COOLDOWN_MS + i*8000; });

  // Run loop every 90s
  const runAll = async () => {
    for (const a of AGENTS) {
      await runAgent(a).catch(e => log(a.id,'error',e.message));
      await new Promise(r => setTimeout(r, 3000));
    }
    dashboard();
  };

  await runAll();
  setInterval(runAll, 90_000);
}

main().catch(console.error);
