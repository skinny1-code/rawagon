/**
 * @rawagon/profit-pilot/network
 * Silent background analytics protocol — served by server.js at /api/profit-pilot
 * 
 * Reads: localStorage keys from all apps (same device)
 * Serves: unified revenue/health data to any app that requests it
 * Runs: as a module in server.js AND as a browser library
 */
'use strict';

// ── Revenue model (matches allocation.json) ────────────────────────────────
const ENTITIES = {
  QWKS:         { name:'QWKS Protocol',        emoji:'⛓',  y2: 7_500_000,  model:'0.01% tx fee'          },
  BitPawn:      { name:'BitPawn',               emoji:'🏦', y2:   961_056,  model:'$99/mo + 0.5% volume'  },
  Droppa:       { name:'Droppa',                emoji:'🎴', y2: 3_744_000,  model:'1% break GMV'          },
  AutoIQ:       { name:'AutoIQ / IQTitle',      emoji:'🚗', y2:12_960_000,  model:'0.3% vehicle value'    },
  AllCard:      { name:'1.nce AllCard',         emoji:'🪪', y2:   898_200,  model:'$49/mo identity'       },
  GoldSnap:     { name:'GoldSnap GTX/STX',      emoji:'🥇', y2:    93_011,  model:'0.25% mint + custody'  },
  DropTheReel:  { name:'Drop The Reel',         emoji:'🎬', y2:   480_000,  model:'$7/mo reviews'         },
  PawnVault:    { name:'BitPawn (merged)',       emoji:'🏦', y2:   360_000,  model:'$99/mo SaaS'           },
  AIOrchestrator:{ name:'AI Orchestrator',      emoji:'🤖', y2:   240_000,  model:'$20/mo multi-model'    },
};

const TOTAL_Y2 = Object.values(ENTITIES).reduce((s,e) => s + e.y2, 0);
const FOUNDER_PCT = 0.15;

// ── LTN economics ─────────────────────────────────────────────────────────
const LTN = {
  price:        0.084,    // USD per LTN
  totalSupply:  40_000_000,
  burnPerTx:    0.001,    // LTN burned per RAWNet tx
  feeRate:      0.001,    // 0.1% of volume
  pStar: (annualFee) => Math.round(annualFee / (0.084 * 0.12)), // break-even stake
};

// ── Browser: reads app localStorage data ─────────────────────────────────
function readLocalStats() {
  if (typeof localStorage === 'undefined') return {};
  const stats = {};
  try {
    // BitPawn
    const bpTickets = JSON.parse(localStorage.getItem('bp-tickets') || '[]');
    const bpBuys    = JSON.parse(localStorage.getItem('bp-buys')    || '[]');
    stats.bitpawn = {
      activeTickets: bpTickets.filter(t => t.status === 'active').length,
      loanBook: bpTickets.reduce((s,t) => s + (t.loan||0), 0),
      buyInventory: bpBuys.length,
    };
    // Droppa
    const dpWinners = JSON.parse(localStorage.getItem('droppa-winners') || '[]');
    const dpBreaks  = JSON.parse(localStorage.getItem('droppa-breaks')  || '[]');
    stats.droppa = {
      totalBreaks: dpBreaks.length,
      totalWinners: dpWinners.length,
      gmv: dpBreaks.reduce((s,b) => s + ((b.slots||0)*(b.price||0)), 0),
    };
  } catch {}
  return stats;
}

// ── Compute P* for different fee levels ──────────────────────────────────
function computePStar(annualFee) { return LTN.pStar(annualFee); }

// ── Revenue share breakdown ───────────────────────────────────────────────
function revenueBreakdown(entityKey) {
  const e = ENTITIES[entityKey];
  if (!e) return null;
  return {
    entity:       e.name,
    y2:           e.y2,
    monthly:      Math.round(e.y2 / 12),
    founder15:    Math.round(e.y2 * 0.15),
    ltnBuyback:   Math.round(e.y2 * 0.10),
    ops:          Math.round(e.y2 * 0.20),
    productDev:   Math.round(e.y2 * 0.30),
    marketing:    Math.round(e.y2 * 0.15),
    reserve:      Math.round(e.y2 * 0.10),
  };
}

// ── Health check for server ───────────────────────────────────────────────
function networkHealth(appCount, contractCount) {
  return {
    status:       'healthy',
    timestamp:    new Date().toISOString(),
    entities:     Object.keys(ENTITIES).length,
    totalY2:      TOTAL_Y2,
    founderY2:    Math.round(TOTAL_Y2 * FOUNDER_PCT),
    ltn:          LTN,
    apps:         appCount,
    contracts:    contractCount,
    entities_detail: ENTITIES,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ENTITIES, TOTAL_Y2, LTN, readLocalStats, computePStar, revenueBreakdown, networkHealth };
} else if (typeof window !== 'undefined') {
  window.ProfitPilot = { ENTITIES, TOTAL_Y2, LTN, readLocalStats, computePStar, revenueBreakdown, networkHealth };
}
