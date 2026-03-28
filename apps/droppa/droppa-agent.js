/**
 * Droppa Streaming Agent
 * ───────────────────────────────────────────────────────
 * Three modes:
 *   ASSIST — responds to manual triggers, parses chat on demand
 *   HOST   — generates scripts, hosts the sale, calls out winners
 *   AUTO   — continuously parses chat every N seconds, auto-assigns
 *            winners, auto-fires notifications when break fills
 *
 * Platform support:
 *   WhatNot · TikTok Live · YouTube Live · Instagram Live
 *
 * Architecture:
 *   - All state in localStorage (droppa-* keys)
 *   - Fires RAWNet events for cross-app communication
 *   - Writes to localStorage droppa-overlay for OBS overlay
 *   - Direct API calls: EasyPost, Resend, Twilio, Discord
 */

'use strict';

// ── Agent State ───────────────────────────────────────────────────────────────
const AGENT = {
  platform:   'whatnot',
  mode:       'assist',          // assist | host | auto
  live:       false,
  breakId:    null,
  sessionStart: null,
  autoInterval: null,
  stats: { winners: 0, revenue: 0, msgsParsed: 0, questionsAnswered: 0 },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const setEl = (id, v) => { const el = $(id); if (el) el.textContent = v; };
const getStoreKey = k => localStorage.getItem('droppa-' + k) || '';

function getAnthropicKey() {
  return localStorage.getItem('rawagon-anthropic-key') ||
         localStorage.getItem('droppa-apikey') ||
         localStorage.getItem('dtr-anthropic') || '';
}

async function aiCall(prompt, maxTokens = 500) {
  const key = getAnthropicKey();
  if (!key) throw new Error('No Anthropic API key — add in Settings');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.content?.[0]?.text || '';
}

function toast(msg, err) {
  if (typeof window.toast === 'function') window.toast(msg, err);
  else console.log((err ? '✗ ' : '✓ ') + msg);
}

function appendChatFeed(line, type = 'normal') {
  const el = $('chat-feed-display');
  if (!el) return;
  const colors = { normal: 'var(--wh)', winner: 'var(--gold)', question: 'var(--cyan)', system: 'var(--soft)' };
  const icons  = { normal: '', winner: '🏆 ', question: '❓ ', system: '· ' };
  const div = document.createElement('div');
  div.style.cssText = `color:${colors[type]};border-bottom:1px solid rgba(255,255,255,.04);padding:2px 0`;
  div.textContent = icons[type] + line;
  // Remove placeholder if present
  const placeholder = el.querySelector('[style*="padding:24px"]');
  if (placeholder) placeholder.remove();
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

// ── Platform UI ───────────────────────────────────────────────────────────────
function setPlatform(plat) {
  AGENT.platform = plat;
  document.querySelectorAll('.plat-btn').forEach(b => {
    const isActive = b.dataset.plat === plat;
    const colors = { whatnot:'rgba(255,60,0,.12)', tiktok:'rgba(0,0,0,.3)', youtube:'rgba(255,0,0,.12)', instagram:'rgba(200,55,200,.12)' };
    const textColors = { whatnot:'#ff6b35', tiktok:'#69c9d0', youtube:'#ff4444', instagram:'#e1306c' };
    const borderColors = { whatnot:'rgba(255,60,0,.3)', tiktok:'rgba(105,201,208,.3)', youtube:'rgba(255,68,68,.3)', instagram:'rgba(225,48,108,.3)' };
    b.style.background = isActive ? colors[plat] : 'rgba(255,255,255,.04)';
    b.style.color      = isActive ? textColors[plat] : 'var(--soft)';
    b.style.borderColor= isActive ? borderColors[plat] : 'var(--line)';
  });
  updateOverlayData();
}

function setAgentMode(mode) {
  AGENT.mode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => {
    const isActive = b.id === 'mode-' + mode;
    b.style.background   = isActive ? 'var(--pr2)' : 'transparent';
    b.style.color        = isActive ? 'var(--purp)' : 'var(--soft)';
    b.style.borderColor  = isActive ? 'var(--purp)' : 'var(--line)';
  });
  const badge = $('agent-mode-badge');
  if (badge) badge.textContent = mode.toUpperCase();
  const hostCard = $('host-script-card');
  if (hostCard) hostCard.style.display = (mode === 'host' || mode === 'auto') ? 'block' : 'none';
  // Auto mode: start interval
  if (AGENT.autoInterval) { clearInterval(AGENT.autoInterval); AGENT.autoInterval = null; }
  if (mode === 'auto' && AGENT.live) startAutoMode();
  appendChatFeed(`Mode switched to ${mode.toUpperCase()}`, 'system');
}

// ── Live Session ──────────────────────────────────────────────────────────────
function toggleLiveSession() {
  if (AGENT.live) endSession();
  else startLiveSession();
}

function startLiveSession() {
  const breakId = ($('ls-break') || {}).value;
  if (!breakId) { toast('Select a break first', true); return; }
  AGENT.live        = true;
  AGENT.breakId     = breakId;
  AGENT.sessionStart= Date.now();
  AGENT.stats       = { winners: 0, revenue: 0, msgsParsed: 0, questionsAnswered: 0 };

  // UI updates
  const btn = $('cc-live-btn');
  if (btn) { btn.style.background = '#7f1d1d'; btn.querySelector('#cc-live-label').textContent = 'END LIVE'; }
  const timerEl = $('session-timer');
  if (timerEl) timerEl.style.display = 'flex';
  const badge = $('break-live-badge');
  if (badge) { badge.textContent = '🔴 LIVE'; badge.style.color = 'var(--red)'; badge.style.background = 'rgba(248,113,113,.15)'; }

  // Duration timer
  clearInterval(window._durTimer);
  window._durTimer = setInterval(() => {
    const s = Math.floor((Date.now() - AGENT.sessionStart) / 1000);
    const display = `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
    setEl('ls-duration-main', display);
    setEl('ls-duration', display);
  }, 1000);

  if (AGENT.mode === 'auto') startAutoMode();
  updateBreakStatus();
  updateOverlayData();
  renderLiveWinnerBoard();
  appendChatFeed(`Session started · ${AGENT.platform.toUpperCase()} · ${new Date().toLocaleTimeString()}`, 'system');
  toast(`Live session started on ${AGENT.platform}`);
}

function endSession() {
  AGENT.live = false;
  clearInterval(window._durTimer);
  clearInterval(AGENT.autoInterval);
  AGENT.autoInterval = null;

  const btn = $('cc-live-btn');
  if (btn) { btn.style.background = 'var(--red)'; btn.querySelector('#cc-live-label').textContent = 'GO LIVE'; }
  const timerEl = $('session-timer');
  if (timerEl) timerEl.style.display = 'none';
  const badge = $('break-live-badge');
  if (badge) { badge.textContent = 'OFFLINE'; badge.style.color = 'var(--soft)'; badge.style.background = 'rgba(255,255,255,.04)'; }

  updateOverlayData();
  appendChatFeed(`Session ended · ${AGENT.stats.winners} winners · $${AGENT.stats.revenue} revenue`, 'system');
  toast(`Session ended — ${AGENT.stats.winners} winners logged`);

  // Auto-navigate to winners if any were captured
  if (AGENT.stats.winners > 0 && typeof show === 'function') {
    setTimeout(() => show('winners'), 1000);
  }
}

// ── Auto Mode ─────────────────────────────────────────────────────────────────
function startAutoMode() {
  if (AGENT.autoInterval) clearInterval(AGENT.autoInterval);
  AGENT.autoInterval = setInterval(autoScanCycle, 12000); // every 12 seconds
  const btn = $('auto-scan-btn');
  if (btn) { btn.textContent = 'Auto-parse: ON'; btn.style.color = 'var(--grn)'; btn.style.borderColor = 'rgba(52,211,153,.3)'; }
  appendChatFeed('Auto-parse enabled — scanning every 12s', 'system');
}

function toggleAutoScan() {
  if (AGENT.autoInterval) {
    clearInterval(AGENT.autoInterval);
    AGENT.autoInterval = null;
    const btn = $('auto-scan-btn');
    if (btn) { btn.textContent = 'Auto-parse: OFF'; btn.style.color = ''; btn.style.borderColor = ''; }
    appendChatFeed('Auto-parse disabled', 'system');
  } else {
    startAutoMode();
  }
}

async function autoScanCycle() {
  const chatInput = $('ls-chat-input');
  if (!chatInput || !chatInput.value.trim()) return;
  await parseChatMessages();
  chatInput.value = ''; // clear after parsing
}

// ── Chat Parsing ──────────────────────────────────────────────────────────────
async function parseChatMessages() {
  const chat = ($('ls-chat-input') || {}).value || '';
  if (!chat.trim()) { toast('Paste chat messages first', true); return; }

  const out = $('ls-ai-output');
  if (out) out.textContent = 'Parsing chat…';

  const breaks = JSON.parse(localStorage.getItem('droppa-breaks') || '[]');
  const brk    = breaks.find(b => b.id === AGENT.breakId) || {};
  const existingWinners = JSON.parse(localStorage.getItem('droppa-winners') || '[]');
  const takenSlots = existingWinners.filter(w => w.breakId === AGENT.breakId).map(w => w.slots);

  const prompt = `You are an AI operations agent for a live card break seller streaming on ${AGENT.platform}.
Break: "${brk.title || 'Card Break'}" · ${brk.slots || 30} slots · $${brk.price || 65}/slot
Taken slots so far: ${takenSlots.join(', ') || 'none'}

Parse these chat messages and identify:
1. Slot purchase requests (user wants a specific slot or random slot)
2. Questions that need answering
3. Compliments or hype (acknowledge them)

Reply ONLY with valid JSON:
{
  "purchases": [{"user": "@username", "slot": "slot# or 'random'", "platform": "${AGENT.platform}"}],
  "questions": ["question text"],
  "hype_moments": ["@user said something great"],
  "summary": "one sentence of what happened"
}

Chat:
${chat}`;

  try {
    const result = await aiCall(prompt, 600);
    let parsed;
    try { parsed = JSON.parse(result.replace(/```json|```/g,'').trim()); } catch { parsed = null; }

    if (parsed) {
      // Add purchases as winners
      const allWinners = JSON.parse(localStorage.getItem('droppa-winners') || '[]');
      const newWinners = (parsed.purchases || []).map(p => ({
        id: Date.now() + Math.random(),
        name: p.user, slots: p.slot,
        breakId: AGENT.breakId, platform: p.platform || AGENT.platform,
        paid: 'pending', label: 'none', ts: Date.now(),
      }));
      if (newWinners.length) {
        allWinners.unshift(...newWinners);
        localStorage.setItem('droppa-winners', JSON.stringify(allWinners));
        AGENT.stats.winners += newWinners.length;
        AGENT.stats.revenue += newWinners.length * (parseFloat(brk.price) || 65);
        updateStats();
        renderLiveWinnerBoard();
        updateOverlayData();
        newWinners.forEach(w => appendChatFeed(`${w.name} → Slot ${w.slots}`, 'winner'));
        // Auto-trigger overlay callout for latest winner
        if (newWinners[0]) overlayAction('winner_callout', newWinners[0].name);
      }

      // Display questions + summary
      AGENT.stats.msgsParsed++;
      const questions = parsed.questions || [];
      const hype = parsed.hype_moments || [];
      let outputText = parsed.summary || '';
      if (questions.length) outputText += '\n\nQuestions:\n' + questions.map((q,i) => `${i+1}. ${q}`).join('\n');
      if (hype.length) { outputText += '\n\nHype:\n' + hype.join('\n'); hype.forEach(h => appendChatFeed(h, 'normal')); }
      if (out) out.textContent = outputText;
      setEl('stat-msgs-live', AGENT.stats.msgsParsed);
      questions.forEach(q => appendChatFeed(q, 'question'));

      // Auto answer first question in host/auto mode
      if ((AGENT.mode === 'host' || AGENT.mode === 'auto') && questions[0]) {
        await answerSpecific(questions[0], brk);
      }
    } else {
      if (out) out.textContent = result;
    }
  } catch(e) {
    if (out) out.textContent = 'Error: ' + e.message;
    toast(e.message, true);
  }
}

async function aiAnswerQuestion() {
  const chat = ($('ls-chat-input') || {}).value || 'How does this break work?';
  const breaks = JSON.parse(localStorage.getItem('droppa-breaks') || '[]');
  const brk = breaks.find(b => b.id === AGENT.breakId) || {};
  await answerSpecific(chat, brk);
}

async function answerSpecific(question, brk) {
  const out = $('ls-ai-output');
  if (out) out.textContent = 'Answering…';
  const prompt = `You are helping a card break host answer this viewer question in 1-2 sentences, casually and helpfully:
Break: "${brk.title || 'Card Break'}" on ${AGENT.platform}
Question: "${question}"`;
  try {
    const answer = await aiCall(prompt, 200);
    if (out) out.textContent = answer;
    AGENT.stats.questionsAnswered++;
    appendChatFeed('Answered: ' + question.slice(0,50), 'system');
  } catch(e) { if (out) out.textContent = 'Error: ' + e.message; }
}

async function generateCallout() {
  const breaks = JSON.parse(localStorage.getItem('droppa-breaks') || '[]');
  const brk = breaks.find(b => b.id === AGENT.breakId) || {};
  const winners = JSON.parse(localStorage.getItem('droppa-winners') || '[]').filter(w => w.breakId === AGENT.breakId);
  const slotsLeft = (brk.slots || 30) - winners.length;
  const out = $('ls-ai-output');
  if (out) out.textContent = 'Generating call-out…';
  const prompt = `Write an energetic 2-sentence live stream call-out for a ${AGENT.platform} card break seller.
Break: "${brk.title || 'Card Break'}" · ${slotsLeft} slots left · $${brk.price || 65}/slot.
Platform style: ${AGENT.platform === 'whatnot' ? 'WhatNot (use "dropping", "going fast")' : AGENT.platform === 'tiktok' ? 'TikTok (energetic, short, emojis ok)' : 'YouTube (informative + exciting)'}.
End with a clear CTA.`;
  try {
    const result = await aiCall(prompt, 180);
    if (out) out.textContent = result;
  } catch(e) { if (out) out.textContent = 'Error: ' + e.message; }
}

async function announceSale() {
  await generateCallout();
}

// ── Host Script Generator ─────────────────────────────────────────────────────
async function genScript(type) {
  const out = $('host-script-output');
  if (!out) return;
  out.textContent = 'Writing script…';

  const breaks = JSON.parse(localStorage.getItem('droppa-breaks') || '[]');
  const brk = breaks.find(b => b.id === AGENT.breakId) || {};
  const shopName = getStoreKey('set-name') || 'your shop';
  const winners = JSON.parse(localStorage.getItem('droppa-winners') || '[]').filter(w => w.breakId === AGENT.breakId);
  const lastWinner = winners[0];

  const SCRIPTS = {
    open:     `Write a 3-sentence opening script for a live card break on ${AGENT.platform}. Shop: "${shopName}". Break: "${brk.title || 'Card Break'}". $${brk.price || 65}/slot, ${brk.slots || 30} slots. Be energetic, welcome viewers, explain how to claim a slot.`,
    item:     `Write a 2-sentence item pitch for a card break seller on ${AGENT.platform}. Break: "${brk.title || 'Card Break'}". Hype the product without being fake. Make people want a slot.`,
    winner:   `Write a 2-sentence winner callout script for ${AGENT.platform}. ${lastWinner ? `Winner: ${lastWinner.name}, Slot: ${lastWinner.slots}` : 'Random winner'} in "${brk.title || 'Card Break'}". Make it exciting and personal.`,
    hype:     `Write a 3-sentence hype/energy boost for a card break seller on ${AGENT.platform}. ${brk.slots || 30} slots, ${winners.length} claimed. Generate urgency. No fake promises.`,
    faq:      `Write a quick FAQ response for a card break on ${AGENT.platform}. Cover: how to claim a slot, when cards ship, how winners are notified. 3 bullet points, conversational.`,
    closing:  `Write a 2-sentence closing for a card break session on ${AGENT.platform}. Break: "${brk.title}". Thank viewers, tease next break, ask for follows.`,
    shipping: `Write a 20-second shipping explanation script for a card break seller on ${AGENT.platform}. Cards ship within 2 business days, USPS Priority or UPS, tracking sent via email/text. Make it feel professional and reassuring.`,
    tease:    `Write a 2-sentence teaser for the NEXT break to announce during a current live on ${AGENT.platform}. Shop: "${shopName}". Make viewers want to come back. Don't reveal specifics — build mystery.`,
  };

  try {
    const result = await aiCall(SCRIPTS[type] || SCRIPTS.hype, 250);
    out.textContent = result;
  } catch(e) { out.textContent = 'Error: ' + e.message; }
}

// ── Full Cycle: Parse → Assign → Update overlay ───────────────────────────────
async function runFullCycle() {
  toast('Running full cycle…');
  appendChatFeed('Full cycle: parse → assign → update overlay', 'system');
  await parseChatMessages();
  await autoAssignCards();
  updateOverlayData();
  renderLiveWinnerBoard();
  toast('Full cycle complete ✓');
}

// ── Post-Show Workflow ────────────────────────────────────────────────────────
async function runPostShowWorkflow() {
  const statusEl = $('postshow-status');
  const winners = JSON.parse(localStorage.getItem('droppa-winners') || '[]')
    .filter(w => w.breakId === AGENT.breakId && w.label === 'none' && w.addr1 && w.city && w.zip);
  
  if (statusEl) statusEl.textContent = `Starting post-show: ${winners.length} winners to process…`;
  
  let done = 0;
  // Step 1: Generate labels for winners with addresses
  if (winners.length > 0 && getStoreKey('ps-easypost')) {
    if (statusEl) statusEl.textContent = 'Generating shipping labels…';
    if (typeof generateBulkLabels === 'function') await generateBulkLabels();
    done++;
  }

  // Step 2: Send winner notifications
  if (statusEl) statusEl.textContent = 'Sending winner notifications…';
  // Load winner template and send
  const resendKey = getStoreKey('n-resend-key');
  const fromEmail = getStoreKey('n-from-email');
  if (resendKey && fromEmail) {
    const allWinners = JSON.parse(localStorage.getItem('droppa-winners') || '[]')
      .filter(w => w.breakId === AGENT.breakId && w.email);
    const breaks = JSON.parse(localStorage.getItem('droppa-breaks') || '[]');
    const brk = breaks.find(b => b.id === AGENT.breakId) || {};
    for (const w of allWinners.slice(0, 20)) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + resendKey },
          body: JSON.stringify({
            from: fromEmail, to: w.email,
            subject: `🏆 You Won! ${brk.title || 'Break Results'}`,
            html: `<p>Congratulations ${w.name}!</p><p>You won slot ${w.slots} in ${brk.title || 'the break'}. Your card: ${w.cards || 'being assigned'}.</p><p>We'll ship within 2 business days and send tracking via email.</p>`
          })
        });
      } catch {}
    }
    done++;
  }

  // Step 3: Discord post
  const discordWebhook = getStoreKey('n-discord-webhook');
  if (discordWebhook) {
    const breaks = JSON.parse(localStorage.getItem('droppa-breaks') || '[]');
    const brk = breaks.find(b => b.id === AGENT.breakId) || {};
    const sessionWinners = JSON.parse(localStorage.getItem('droppa-winners') || '[]')
      .filter(w => w.breakId === AGENT.breakId);
    try {
      await fetch(discordWebhook, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `🎴 **${brk.title || 'Break'} Complete!**\n${sessionWinners.length} winners · $${AGENT.stats.revenue} total\nCards shipping within 2 business days.` })
      });
      done++;
    } catch {}
  }

  if (statusEl) {
    statusEl.textContent = `✓ Post-show complete — ${done} steps done`;
    statusEl.style.color = 'var(--grn)';
  }
  toast(`Post-show workflow complete — ${done} steps ✓`);
}

// ── Overlay Actions ────────────────────────────────────────────────────────────
function overlayAction(action, data = null) {
  const overlay = JSON.parse(localStorage.getItem('droppa-overlay') || '{}');
  overlay.action = action;
  overlay.actionData = data;
  overlay.actionTs = Date.now();
  localStorage.setItem('droppa-overlay', JSON.stringify(overlay));
}

function copyOverlayUrl() {
  const el = $('overlay-url');
  if (el) navigator.clipboard.writeText(el.textContent).then(() => toast('Overlay URL copied ✓'));
}

function updateOverlayData() {
  const breaks = JSON.parse(localStorage.getItem('droppa-breaks') || '[]');
  const brk    = breaks.find(b => b.id === AGENT.breakId) || {};
  const winners = JSON.parse(localStorage.getItem('droppa-winners') || '[]').filter(w => w.breakId === AGENT.breakId);
  const lastWinner = winners[0];
  localStorage.setItem('droppa-overlay', JSON.stringify({
    ts: Date.now(),
    breakTitle: brk.title || '',
    slots: brk.slots || 0,
    price: brk.price || 0,
    filled: winners.length,
    platform: AGENT.platform,
    live: AGENT.live,
    lastWinner: lastWinner?.name || '',
    lastSlot: lastWinner?.slots || '',
    sessionRevenue: AGENT.stats.revenue,
  }));
}

// ── Live Winner Board ──────────────────────────────────────────────────────────
function renderLiveWinnerBoard() {
  const el = $('live-winner-board');
  if (!el) return;
  const winners = JSON.parse(localStorage.getItem('droppa-winners') || '[]')
    .filter(w => w.breakId === AGENT.breakId)
    .slice(0, 12);
  if (!winners.length) {
    el.innerHTML = '<div style="color:var(--dim);font-size:.74rem;text-align:center;padding:20px">No winners yet this session</div>';
    return;
  }
  el.innerHTML = winners.map(w => {
    const paidColor = w.paid === 'paid' ? 'var(--grn)' : 'var(--gold)';
    const labelIcon = w.label === 'created' ? '📦' : w.label === 'shipped' ? '✅' : '🕐';
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--s2);border-radius:7px;font-size:.74rem;animation:rw-fadeUp .2s ease">
      <div style="font-size:.9rem">${labelIcon}</div>
      <div style="flex:1;overflow:hidden">
        <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${w.name}</div>
        <div style="font-size:.64rem;color:var(--soft)">Slot ${w.slots || '?'} · ${w.platform || AGENT.platform}</div>
      </div>
      <span style="font-size:.62rem;font-weight:700;color:${paidColor}">${(w.paid || 'pending').toUpperCase()}</span>
    </div>`;
  }).join('');
  setEl('winner-count-badge', `${winners.length} winner${winners.length !== 1 ? 's' : ''}`);
  setEl('stat-winners-live', winners.length);
  setEl('stat-revenue-live', '$' + (winners.length * (parseFloat(JSON.parse(localStorage.getItem('droppa-breaks') || '[]').find(b => b.id === AGENT.breakId)?.price || 65))).toFixed(0));
}

// ── Break Status Panel ──────────────────────────────────────────────────────────
function updateBreakStatus() {
  const el = $('break-status-display');
  if (!el || !AGENT.breakId) return;
  const breaks = JSON.parse(localStorage.getItem('droppa-breaks') || '[]');
  const brk = breaks.find(b => b.id === AGENT.breakId) || {};
  const winners = JSON.parse(localStorage.getItem('droppa-winners') || '[]').filter(w => w.breakId === AGENT.breakId);
  const filled = winners.length;
  const total  = brk.slots || 30;
  const pct    = Math.min(100, Math.round((filled / total) * 100));
  const revenue = filled * (parseFloat(brk.price) || 65);

  el.innerHTML = `<div style="margin-bottom:8px">
    <div style="font-weight:700;font-size:.86rem;margin-bottom:2px">${brk.title || 'Break'}</div>
    <div style="font-size:.7rem;color:var(--soft)">${brk.fmt || 'Random Teams'} · $${brk.price || 65}/slot</div>
  </div>
  <div style="display:flex;gap:6px;margin-bottom:8px">
    <div style="flex:1;text-align:center;padding:7px;background:var(--s2);border-radius:7px">
      <div style="font-size:1.2rem;font-weight:800;color:var(--purp)">${filled}/${total}</div>
      <div style="font-size:.6rem;color:var(--soft)">Slots</div>
    </div>
    <div style="flex:1;text-align:center;padding:7px;background:var(--s2);border-radius:7px">
      <div style="font-size:1.2rem;font-weight:800;color:var(--gold)">$${revenue.toFixed(0)}</div>
      <div style="font-size:.6rem;color:var(--soft)">Revenue</div>
    </div>
    <div style="flex:1;text-align:center;padding:7px;background:var(--s2);border-radius:7px">
      <div style="font-size:1.2rem;font-weight:800;color:${pct>=100?'var(--grn)':'var(--wh)'}">${pct}%</div>
      <div style="font-size:.6rem;color:var(--soft)">Filled</div>
    </div>
  </div>
  <div style="height:5px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden">
    <div style="height:100%;border-radius:3px;background:linear-gradient(90deg,var(--purp),var(--pink));transition:width .4s ease;width:${pct}%"></div>
  </div>`;
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function updateStats() {
  setEl('stat-winners-live', AGENT.stats.winners);
  setEl('stat-revenue-live', '$' + AGENT.stats.revenue.toFixed(0));
  setEl('stat-msgs-live',    AGENT.stats.msgsParsed);
  setEl('ls-assigned',       AGENT.stats.winners);
  setEl('ls-msgs-parsed',    AGENT.stats.msgsParsed);
}

function clearChat() {
  const el = $('ls-chat-input');
  if (el) el.value = '';
  const feed = $('chat-feed-display');
  if (feed) feed.innerHTML = '<div style="color:var(--dim);text-align:center;padding:24px 0">Chat cleared</div>';
}

function copyAgentOutput() {
  const el = $('ls-ai-output');
  if (el) navigator.clipboard.writeText(el.textContent).then(() => toast('Copied ✓'));
}

// ── Init ──────────────────────────────────────────────────────────────────────
function agentInit() {
  // Set overlay URL to current server
  const overlayEl = $('overlay-url');
  if (overlayEl) overlayEl.textContent = window.location.origin + '/apps/droppa/overlay.html';

  // Populate break selects
  if (typeof populateBreakSelects === 'function') populateBreakSelects();

  // Default to WhatNot
  setPlatform('whatnot');

  // Restore break selection
  const savedBreak = localStorage.getItem('droppa-last-break');
  const breakSel = $('ls-break');
  if (breakSel && savedBreak) breakSel.value = savedBreak;

  // Watch for break selection change
  if (breakSel) {
    breakSel.addEventListener('change', e => {
      AGENT.breakId = e.target.value;
      localStorage.setItem('droppa-last-break', AGENT.breakId);
      updateBreakStatus();
      renderLiveWinnerBoard();
      updateOverlayData();
    });
  }

  // Update break/winner board on storage events (cross-tab)
  window.addEventListener('storage', e => {
    if (e.key === 'droppa-winners' || e.key === 'droppa-breaks') {
      updateBreakStatus();
      renderLiveWinnerBoard();
    }
  });

  // Refresh winner board every 10 seconds during live session
  setInterval(() => {
    if (AGENT.live) { renderLiveWinnerBoard(); updateBreakStatus(); }
  }, 10000);
}

window.addEventListener('load', agentInit);
