// ═══════════════════════════════════════════════════════════════════════
// DROPPA LIVE STREAM + WINNERS + POSTAGE + NOTIFY  —  full implementation
// Injected as separate block; functions referenced from pane HTML above
// ═══════════════════════════════════════════════════════════════════════

// ── helpers ──────────────────────────────────────────────────────────────
function setElText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function getKey(name) {
  return localStorage.getItem('droppa-' + name) || '';
}

// ── LIVE STREAM ──────────────────────────────────────────────────────────
let liveSession = null;

function populateBreakSelects() {
  const breaks = JSON.parse(localStorage.getItem('droppa-breaks') || '[]');
  ['ls-break', 'w-break-filter'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = id === 'w-break-filter'
      ? '<option value="">All Breaks</option>'
      : '<option value="">-- select active break --</option>';
    breaks.forEach(b => {
      const o = document.createElement('option');
      o.value = b.id; o.textContent = b.title || b.id;
      sel.appendChild(o);
    });
    if (prev) sel.value = prev;
  });
}

function startLiveSession() {
  const breakId  = document.getElementById('ls-break').value;
  const platform = document.getElementById('ls-platform').value;
  if (!breakId) { toast('Select a break first', true); return; }
  const breaks = JSON.parse(localStorage.getItem('droppa-breaks') || '[]');
  const brk    = breaks.find(b => b.id === breakId) || { title: breakId };
  liveSession  = { breakId, platform, startTime: Date.now(), assigned: 0, msgsParsed: 0, answered: 0 };
  const banner = document.getElementById('ls-live-banner');
  if (banner) banner.style.display = 'flex';
  setElText('ls-break-name', brk.title);
  const btn = document.getElementById('ls-start-btn');
  if (btn) { btn.textContent = '● LIVE'; btn.style.background = 'var(--red)'; }
  clearInterval(window._durationTimer);
  window._durationTimer = setInterval(() => {
    const secs = Math.floor((Date.now() - liveSession.startTime) / 1000);
    setElText('ls-duration', Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0'));
  }, 1000);
  toast('Session started on ' + platform);
  updateOverlayData();
}

async function parseChatMessages() {
  const chat = (document.getElementById('ls-chat-input') || {}).value || '';
  if (!chat.trim()) { toast('Paste chat messages first', true); return; }
  if (!liveSession) { toast('Start a session first', true); return; }
  const prompt = 'You are an assistant for a card break seller streaming on ' + liveSession.platform + '.\n' +
    'Parse these chat messages. Identify: (1) slot purchase requests, (2) questions.\n' +
    'Reply ONLY with JSON: {"purchases":[{"user":"name","slot":"slot#"}],"questions":["q1"],"summary":"1 sentence"}\n' +
    'Chat:\n' + chat;
  try {
    document.getElementById('ls-ai-output').textContent = 'Parsing chat…';
    const result = await anthropicFetch([{ role: 'user', content: prompt }], 500);
    let parsed = null;
    try { parsed = JSON.parse(result.replace(/```json|```/g, '').trim()); } catch(e) {}
    if (parsed && parsed.purchases) {
      const winners = JSON.parse(localStorage.getItem('droppa-winners') || '[]');
      (parsed.purchases || []).forEach(p => {
        winners.push({ id: Date.now() + Math.random(), name: p.user, slots: p.slot,
          breakId: liveSession.breakId, platform: liveSession.platform,
          paid: 'pending', label: 'none', ts: Date.now() });
      });
      localStorage.setItem('droppa-winners', JSON.stringify(winners));
      liveSession.assigned += (parsed.purchases || []).length;
      setElText('ls-assigned', liveSession.assigned);
    }
    liveSession.msgsParsed++;
    setElText('ls-msgs-parsed', liveSession.msgsParsed);
    const questions = (parsed && parsed.questions || []);
    document.getElementById('ls-ai-output').textContent =
      'Parsed ' + ((parsed && parsed.purchases || []).length) + ' purchases\n\n' +
      ((parsed && parsed.summary) || '') + (questions.length ? '\n\nQuestions:\n' + questions.join('\n') : '');
    renderWinnersTable();
    updateOverlayData();
  } catch(e) { document.getElementById('ls-ai-output').textContent = 'Error: ' + e.message; }
}

async function generateCallout() {
  const breakId = (document.getElementById('ls-break') || {}).value;
  const platform = (document.getElementById('ls-platform') || {}).value || 'WhatNot';
  const breaks = JSON.parse(localStorage.getItem('droppa-breaks') || '[]');
  const brk = breaks.find(b => b.id === breakId) || {};
  const prompt = 'Write an energetic 2-sentence live stream call-out for a card break seller on ' + platform + '. ' +
    'Break: ' + (brk.title || 'Sports Card Break') + ', ' + (brk.slots || 30) + ' slots at $' + (brk.price || 65) + '/slot. ' +
    'Be hype, end with a clear CTA to claim a slot.';
  try {
    document.getElementById('ls-ai-output').textContent = 'Generating…';
    document.getElementById('ls-ai-output').textContent = await anthropicFetch([{ role:'user', content: prompt }], 200);
  } catch(e) { document.getElementById('ls-ai-output').textContent = 'Error: ' + e.message; }
}

async function aiAnswerQuestion() {
  const chat = ((document.getElementById('ls-chat-input') || {}).value || '').trim() || 'How does this break work?';
  const prompt = 'You are a card break host assistant. Answer this chat question in 1-2 short, friendly sentences: "' + chat + '"';
  try {
    document.getElementById('ls-ai-output').textContent = 'Answering…';
    document.getElementById('ls-ai-output').textContent = await anthropicFetch([{ role:'user', content: prompt }], 150);
    if (liveSession) { liveSession.answered++; setElText('ls-answered', liveSession.answered); }
  } catch(e) { document.getElementById('ls-ai-output').textContent = 'Error: ' + e.message; }
}

async function announceSale() {
  const prompt = 'Write a 2-sentence hype announcement for a card break. Be energetic. End with "slots going fast!"';
  try {
    document.getElementById('ls-ai-output').textContent = 'Generating hype…';
    document.getElementById('ls-ai-output').textContent = await anthropicFetch([{ role:'user', content: prompt }], 120);
  } catch(e) { document.getElementById('ls-ai-output').textContent = 'Error: ' + e.message; }
}

function endSession() {
  clearInterval(window._durationTimer);
  liveSession = null;
  const banner = document.getElementById('ls-live-banner');
  if (banner) banner.style.display = 'none';
  const btn = document.getElementById('ls-start-btn');
  if (btn) { btn.textContent = '▶ Go Live'; btn.style.background = 'var(--red)'; }
  toast('Session ended — check Winners tab');
  show('winners');
}

function updateOverlayData() {
  const breakId = liveSession && liveSession.breakId;
  const breaks  = JSON.parse(localStorage.getItem('droppa-breaks') || '[]');
  const brk     = breaks.find(b => b.id === breakId) || {};
  const winners = JSON.parse(localStorage.getItem('droppa-winners') || '[]').filter(w => w.breakId === breakId);
  localStorage.setItem('droppa-overlay', JSON.stringify({
    ts: Date.now(), breakTitle: brk.title, slots: brk.slots, price: brk.price,
    filled: winners.length, platform: (liveSession && liveSession.platform) || 'WhatNot',
    live: !!liveSession, lastWinner: (winners[0] && winners[0].name) || ''
  }));
}

// ── WINNERS ───────────────────────────────────────────────────────────────
function addWinnerManual() {
  const panel = document.getElementById('add-winner-panel');
  if (panel) { panel.style.display = 'block'; panel.scrollIntoView({ behavior: 'smooth' }); }
}

function saveWinner() {
  const name = (document.getElementById('aw-name') || {}).value || '';
  if (!name.trim()) { toast('Winner name required', true); return; }
  const w = {
    id: Date.now(), name: name.trim(),
    slots:    (document.getElementById('aw-slots')    || {}).value || '',
    cards:    (document.getElementById('aw-cards')    || {}).value || '',
    platform: (document.getElementById('aw-platform') || {}).value || '',
    email:    (document.getElementById('aw-email')    || {}).value || '',
    phone:    (document.getElementById('aw-phone')    || {}).value || '',
    addr1:    (document.getElementById('aw-addr1')    || {}).value || '',
    city:     (document.getElementById('aw-city')     || {}).value || '',
    state:    (document.getElementById('aw-state')    || {}).value || '',
    zip:      (document.getElementById('aw-zip')      || {}).value || '',
    paid:     (document.getElementById('aw-paid')     || {}).value || 'pending',
    value:    (document.getElementById('aw-value')    || {}).value || '',
    label: 'none', breakId: (document.getElementById('ls-break') || {}).value || '', ts: Date.now()
  };
  const winners = JSON.parse(localStorage.getItem('droppa-winners') || '[]');
  winners.unshift(w);
  localStorage.setItem('droppa-winners', JSON.stringify(winners));
  const panel = document.getElementById('add-winner-panel');
  if (panel) panel.style.display = 'none';
  ['aw-name','aw-slots','aw-cards','aw-email','aw-phone','aw-addr1','aw-city','aw-state','aw-zip','aw-value'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  renderWinnersTable(); updatePostageStats();
  toast('Winner ' + w.name + ' saved \u2713');
}

function renderWinnersTable() {
  const filterEl = document.getElementById('w-break-filter');
  const breakFilter = filterEl ? filterEl.value : '';
  let winners = JSON.parse(localStorage.getItem('droppa-winners') || '[]');
  if (breakFilter) winners = winners.filter(w => w.breakId === breakFilter);
  const tbody = document.getElementById('winners-tbody');
  if (!tbody) return;
  if (!winners.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--soft);font-size:.78rem">No winners yet</td></tr>';
    setElText('w-total', 0); setElText('w-labels-needed', 0); setElText('w-shipped', 0);
    return;
  }
  tbody.innerHTML = winners.map(w => {
    const labelColor = w.label === 'shipped' ? 'var(--grn)' : w.label === 'created' ? 'var(--gold)' : 'var(--soft)';
    const paidColor  = w.paid  === 'paid'    ? 'var(--grn)' : w.paid    === 'pending' ? 'var(--gold)' : 'var(--red)';
    const hasAddr    = w.addr1 && w.city && w.zip;
    return '<tr>' +
      '<td style="padding:8px 12px"><div style="font-weight:700;font-size:.8rem">' + w.name + '</div>' +
        (w.email ? '<div style="font-size:.66rem;color:var(--soft)">' + w.email + '</div>' : '') + '</td>' +
      '<td style="font-family:\'JetBrains Mono\',monospace;font-size:.74rem">' + (w.slots || '\u2014') + '</td>' +
      '<td style="font-size:.74rem;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (w.cards || '\u2014') + '</td>' +
      '<td style="font-size:.72rem;color:var(--soft)">' + (w.platform || '\u2014') + '</td>' +
      '<td><span style="font-size:.68rem;font-weight:700;color:' + paidColor + '">' + (w.paid || 'pending').toUpperCase() + '</span></td>' +
      '<td><span style="font-size:.68rem;font-weight:700;color:' + labelColor + '">' + (w.label || 'none').toUpperCase() + '</span>' +
        (!hasAddr ? '<div style="font-size:.62rem;color:var(--red)">no addr</div>' : '') + '</td>' +
      '<td style="white-space:nowrap">' +
        '<button class="btn btn-outline btn-sm" onclick="editWinner(' + w.id + ')" style="margin-right:3px">Edit</button>' +
        '<button class="btn btn-outline btn-sm" onclick="generateOneLabel(' + w.id + ')"' + (!hasAddr ? ' disabled title="Need address"' : '') + '>Label</button>' +
      '</td></tr>';
  }).join('');
  setElText('w-total',         winners.length);
  setElText('w-labels-needed', winners.filter(w => w.label === 'none' && w.addr1).length);
  setElText('w-shipped',       winners.filter(w => w.label === 'shipped').length);
}

function loadWinners() { renderWinnersTable(); }

async function autoAssignCards() {
  const inv     = JSON.parse(localStorage.getItem('droppa-inventory') || '[]');
  const winners = JSON.parse(localStorage.getItem('droppa-winners')   || '[]').filter(w => !w.cards);
  if (!winners.length) { toast('All winners have cards assigned'); return; }
  if (!inv.length)     { toast('Add inventory items first', true); return; }
  const prompt = 'Assign these inventory items to winners randomly but fairly.\n' +
    'Winners: ' + winners.map(w => w.name).join(', ') + '\n' +
    'Items: '   + inv.slice(0, winners.length).map(i => i.name).join(', ') + '\n' +
    'Return ONLY JSON array: [{"winner":"name","card":"item name"}]';
  try {
    const result      = await anthropicFetch([{ role:'user', content: prompt }], 500);
    const assignments = JSON.parse(result.replace(/```json|```/g, '').trim());
    const all         = JSON.parse(localStorage.getItem('droppa-winners') || '[]');
    assignments.forEach(a => { const w = all.find(x => x.name === a.winner); if (w) w.cards = a.card; });
    localStorage.setItem('droppa-winners', JSON.stringify(all));
    renderWinnersTable();
    toast(assignments.length + ' cards auto-assigned \u2713');
  } catch(e) { toast('Auto-assign failed: ' + e.message.split('(')[0], true); }
}

function editWinner(id) {
  const winners = JSON.parse(localStorage.getItem('droppa-winners') || '[]');
  const w = winners.find(x => x.id === id);
  if (!w) return;
  const panel = document.getElementById('add-winner-panel');
  if (panel) panel.style.display = 'block';
  const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ''; };
  set('aw-name', w.name); set('aw-slots', w.slots); set('aw-cards', w.cards);
  set('aw-email', w.email); set('aw-phone', w.phone); set('aw-addr1', w.addr1);
  set('aw-city', w.city); set('aw-state', w.state); set('aw-zip', w.zip);
  set('aw-value', w.value);
  const paidEl = document.getElementById('aw-paid'); if (paidEl) paidEl.value = w.paid || 'pending';
  localStorage.setItem('droppa-winners', JSON.stringify(winners.filter(x => x.id !== id)));
}

function exportWinnersCSV() {
  const winners = JSON.parse(localStorage.getItem('droppa-winners') || '[]');
  if (!winners.length) { toast('No winners to export', true); return; }
  const header = 'Name,Slots,Cards,Platform,Email,Phone,Address,City,State,ZIP,Paid,Label\n';
  const rows   = winners.map(w =>
    [w.name,w.slots,w.cards,w.platform,w.email,w.phone,w.addr1,w.city,w.state,w.zip,w.paid,w.label]
    .map(v => '"' + (v||'') + '"').join(',')
  ).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([header+rows], {type:'text/csv'}));
  a.download = 'winners_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  toast('Winners CSV exported \u2713');
}

// ── POSTAGE (EasyPost) ─────────────────────────────────────────────────────
function savePostageSettings() {
  ['ps-carrier','ps-pkg','ps-weight'].forEach(id => {
    const el = document.getElementById(id); if (el) localStorage.setItem('droppa-' + id, el.value);
  });
  ['ps-signature','ps-insurance'].forEach(id => {
    const el = document.getElementById(id); if (el) localStorage.setItem('droppa-' + id, el.checked);
  });
  toast('Postage preferences saved \u2713');
}

function loadPostageSettings() {
  ['ps-carrier','ps-pkg','ps-weight'].forEach(id => {
    const el = document.getElementById(id); const v = getKey(id); if (el && v) el.value = v;
  });
  ['ps-signature','ps-insurance'].forEach(id => {
    const el = document.getElementById(id); const v = getKey(id); if (el && v !== '') el.checked = v === 'true';
  });
  ['ps-easypost','ps-sender-name','ps-addr1','ps-city','ps-state','ps-zip'].forEach(id => {
    const el = document.getElementById(id); const v = getKey(id); if (el && v) el.value = v;
  });
}

function saveShippingKeys() {
  ['ps-easypost','ps-sender-name','ps-addr1','ps-city','ps-state','ps-zip'].forEach(id => {
    const el = document.getElementById(id); if (el) localStorage.setItem('droppa-' + id, el.value);
  });
  const st = document.getElementById('ps-key-status');
  if (st) { st.textContent = '\u2713 Saved'; st.style.color = 'var(--grn)'; }
  toast('Shipping settings saved \u2713');
}

function updateCarrierUI() {
  const pkg  = document.getElementById('ps-pkg');
  const dims = document.getElementById('custom-dims');
  if (dims && pkg) dims.style.display = pkg.value === 'custom' ? 'block' : 'none';
}

async function shopRates() {
  const toZip  = (document.getElementById('rs-to-zip')  || {}).value || '';
  const weight = parseFloat((document.getElementById('rs-weight') || {}).value) || 2;
  const value  = parseFloat((document.getElementById('rs-value')  || {}).value) || 0;
  const apiKey = getKey('ps-easypost');
  const el     = document.getElementById('rates-display');
  if (!toZip) { toast('Enter destination ZIP', true); return; }
  el.innerHTML = '<div style="color:var(--soft);font-size:.76rem">Fetching rates\u2026</div>';

  if (!apiKey) {
    // Estimated rates (no API key)
    const uspsFC  = weight <= 13 ? (3.79 + weight * 0.18).toFixed(2) : null;
    const uspsPri = (8.70 + (weight/16) * 1.20).toFixed(2);
    const upsGnd  = (9.45 + (weight/16) * 1.85).toFixed(2);
    el.innerHTML =
      '<div style="font-size:.7rem;color:var(--gold);margin-bottom:8px;padding:4px 8px;background:rgba(245,158,11,.06);border-radius:5px">Add EasyPost API key for live rates \u2014 showing estimates</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:.76rem">' +
      '<thead><tr style="border-bottom:1px solid var(--line)"><th style="text-align:left;padding:5px 0;color:var(--soft)">Service</th><th style="text-align:right;color:var(--soft)">Est.</th><th style="text-align:right;color:var(--soft)">Days</th></tr></thead><tbody>' +
      (uspsFC ? '<tr style="border-bottom:1px solid var(--ln2)"><td style="padding:6px 0">USPS First Class</td><td style="text-align:right;color:var(--grn)">$' + uspsFC + '</td><td style="text-align:right;color:var(--soft)">3-5</td></tr>' : '') +
      '<tr style="border-bottom:1px solid var(--ln2)"><td style="padding:6px 0">USPS Priority Mail</td><td style="text-align:right;color:var(--grn)">$' + uspsPri + '</td><td style="text-align:right;color:var(--soft)">1-3</td></tr>' +
      '<tr><td style="padding:6px 0">UPS Ground</td><td style="text-align:right;color:var(--soft)">$' + upsGnd + '</td><td style="text-align:right;color:var(--soft)">1-5</td></tr>' +
      '</tbody></table>';
    return;
  }

  // Real EasyPost call
  try {
    const fromAddr  = getKey('ps-addr1')  || '123 Main St';
    const fromCity  = getKey('ps-city')   || 'New York';
    const fromState = getKey('ps-state')  || 'NY';
    const fromZip   = getKey('ps-zip')    || '10001';
    const resp = await fetch('https://api.easypost.com/v2/shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + btoa(apiKey + ':') },
      body: JSON.stringify({ shipment: {
        from_address: { street1: fromAddr, city: fromCity, state: fromState, zip: fromZip, country: 'US' },
        to_address:   { zip: toZip, country: 'US' },
        parcel:       { weight: weight, predefined_package: 'Parcel' }
      }})
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);
    const rates = (data.rates || []).sort((a,b) => parseFloat(a.rate) - parseFloat(b.rate));
    el.innerHTML =
      '<table style="width:100%;border-collapse:collapse;font-size:.76rem">' +
      '<thead><tr style="border-bottom:1px solid var(--line)"><th style="text-align:left;padding:5px 0;color:var(--soft)">Service</th><th style="text-align:right;color:var(--soft)">Rate</th><th style="text-align:right;color:var(--soft)">Days</th><th></th></tr></thead><tbody>' +
      rates.slice(0,6).map((r,i) =>
        '<tr style="border-bottom:1px solid var(--ln2)">' +
        '<td style="padding:6px 0">' + r.carrier + ' ' + r.service + '</td>' +
        '<td style="text-align:right;color:' + (i===0?'var(--grn)':'var(--wh)') + '">$' + parseFloat(r.rate).toFixed(2) + '</td>' +
        '<td style="text-align:right;color:var(--soft)">' + (r.delivery_days||'?') + '</td>' +
        '<td><button class="btn btn-outline btn-sm" onclick="buyLabel(\'' + data.id + '\',\'' + r.id + '\',' + r.rate + ')">Buy</button></td>' +
        '</tr>'
      ).join('') +
      '</tbody></table>' +
      '<div style="font-size:.66rem;color:var(--soft);margin-top:6px">EasyPost ID: ' + data.id + '</div>';
  } catch(e) {
    el.innerHTML = '<div style="color:var(--red);font-size:.76rem">EasyPost error: ' + e.message.split('(')[0] + '</div>';
  }
}

async function buyLabel(shipmentId, rateId, rate) {
  const apiKey = getKey('ps-easypost');
  if (!apiKey) { toast('EasyPost API key required', true); return; }
  try {
    const resp = await fetch('https://api.easypost.com/v2/shipments/' + shipmentId + '/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + btoa(apiKey + ':') },
      body: JSON.stringify({ rate: { id: rateId } })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);
    if (data.postage_label && data.postage_label.label_url) {
      window.open(data.postage_label.label_url, '_blank');
      toast('Label $' + parseFloat(rate).toFixed(2) + ' — opening PDF \u2713');
    }
    return data;
  } catch(e) { toast('Label failed: ' + e.message.split('(')[0], true); return null; }
}

function updatePostageStats() {
  const winners    = JSON.parse(localStorage.getItem('droppa-winners') || '[]');
  const needLabel  = winners.filter(w => w.label === 'none');
  const hasAddr    = needLabel.filter(w => w.addr1 && w.city && w.zip);
  const missing    = needLabel.filter(w => !w.addr1 || !w.city || !w.zip);
  const wt         = parseFloat(getKey('ps-weight') || '2');
  const estCost    = (hasAddr.length * (wt <= 4 ? 4.50 : 8.70)).toFixed(2);
  setElText('bulk-count',   needLabel.length);
  setElText('bulk-missing', missing.length);
  setElText('bulk-est',     '$' + estCost);
  setElText('bulk-ready',   winners.filter(w => w.label === 'created' || w.label === 'shipped').length);
}

async function generateBulkLabels() {
  const apiKey = getKey('ps-easypost');
  const all    = JSON.parse(localStorage.getItem('droppa-winners') || '[]');
  const queue  = all.filter(w => w.label === 'none' && w.addr1 && w.city && w.zip);
  if (!queue.length) { toast('No winners with complete addresses', true); return; }
  if (!apiKey)       { toast('Add EasyPost key in Postage Settings', true); return; }
  const statusEl  = document.getElementById('bulk-status');
  const labelList = document.getElementById('label-list');
  if (statusEl)  statusEl.textContent = 'Creating ' + queue.length + ' labels\u2026';
  if (labelList) labelList.innerHTML  = '';
  let created = 0;
  for (const w of queue) {
    try {
      const resp = await fetch('https://api.easypost.com/v2/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + btoa(apiKey + ':') },
        body: JSON.stringify({ shipment: {
          from_address: { name: getKey('ps-sender-name')||'Droppa Seller', street1: getKey('ps-addr1'), city: getKey('ps-city'), state: getKey('ps-state'), zip: getKey('ps-zip'), country: 'US' },
          to_address:   { name: w.name, street1: w.addr1, city: w.city, state: w.state, zip: w.zip, country: 'US' },
          parcel:       { weight: parseFloat(getKey('ps-weight')||'2') }
        }})
      });
      const data     = await resp.json();
      const cheapest = (data.rates||[]).sort((a,b) => parseFloat(a.rate)-parseFloat(b.rate))[0];
      if (cheapest) {
        const buyData = await buyLabel(data.id, cheapest.id, cheapest.rate);
        if (buyData && !buyData.error) {
          const idx = all.findIndex(x => x.id === w.id);
          if (idx >= 0) { all[idx].label = 'created'; all[idx].tracking = buyData.tracking_code; all[idx].labelUrl = buyData.postage_label && buyData.postage_label.label_url; }
          created++;
          if (labelList) labelList.innerHTML +=
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--ln2);font-size:.74rem">' +
            '<span>' + w.name + '</span><span style="color:var(--soft);font-size:.68rem">' + (buyData.tracking_code||'') + '</span>' +
            (buyData.postage_label && buyData.postage_label.label_url ? '<a href="' + buyData.postage_label.label_url + '" target="_blank" style="color:var(--gold);text-decoration:none;font-size:.68rem">\u2193 Label</a>' : '') +
            '</div>';
        }
      }
    } catch(e) {
      if (labelList) labelList.innerHTML += '<div style="color:var(--red);font-size:.72rem;padding:3px 0">' + w.name + ': ' + e.message.split('(')[0] + '</div>';
    }
    if (statusEl) statusEl.textContent = created + ' of ' + queue.length + ' created\u2026';
  }
  localStorage.setItem('droppa-winners', JSON.stringify(all));
  if (statusEl) { statusEl.textContent = '\u2713 ' + created + ' labels created'; statusEl.style.color = 'var(--grn)'; }
  renderWinnersTable(); updatePostageStats();
  toast(created + ' shipping labels created \u2713');
}

async function generateOneLabel(winnerId) {
  const apiKey  = getKey('ps-easypost');
  if (!apiKey) { toast('Add EasyPost key in Postage tab', true); return; }
  const winners = JSON.parse(localStorage.getItem('droppa-winners') || '[]');
  const w       = winners.find(x => x.id === winnerId);
  if (!w) return;
  try {
    const resp = await fetch('https://api.easypost.com/v2/shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + btoa(apiKey + ':') },
      body: JSON.stringify({ shipment: {
        from_address: { name: getKey('ps-sender-name')||'Droppa Seller', street1: getKey('ps-addr1'), city: getKey('ps-city'), state: getKey('ps-state'), zip: getKey('ps-zip'), country: 'US' },
        to_address:   { name: w.name, street1: w.addr1, city: w.city, state: w.state, zip: w.zip, country: 'US' },
        parcel:       { weight: 2 }
      }})
    });
    const data     = await resp.json();
    const cheapest = (data.rates||[]).sort((a,b) => parseFloat(a.rate)-parseFloat(b.rate))[0];
    if (cheapest) {
      await buyLabel(data.id, cheapest.id, cheapest.rate);
      const idx = winners.findIndex(x => x.id === winnerId);
      if (idx >= 0) winners[idx].label = 'created';
      localStorage.setItem('droppa-winners', JSON.stringify(winners));
      renderWinnersTable();
    }
  } catch(e) { toast('Label error: ' + e.message.split('(')[0], true); }
}

function downloadAllLabels() {
  const winners = JSON.parse(localStorage.getItem('droppa-winners') || '[]').filter(w => w.labelUrl);
  if (!winners.length) { toast('No labels created yet', true); return; }
  winners.forEach((w, i) => setTimeout(() => window.open(w.labelUrl, '_blank'), i * 500));
  toast('Opening ' + winners.length + ' labels');
}

// ── NOTIFY (Resend + Twilio + Discord) ────────────────────────────────────
const TEMPLATES = {
  announce: { subject: '\uD83C\uDFB4 Box Break Tonight! {break_name}', message: 'Hey {name}!\n\nWe\'re hosting a LIVE box break: {break_name}\n\nHappening TONIGHT \u2014 slots going fast!\nJoin us live and get in on the action!\n\n{shop_name}' },
  winner:   { subject: '\uD83C\uDFC6 You Won! {break_name} Results',   message: 'Congratulations {name}!\n\nYou won in our {break_name} break!\n\n\uD83C\uDFB4 Your card(s): {card}\n\nPlease reply to confirm your shipping address.\n{shop_name}' },
  shipped:  { subject: '\uD83D\uDCE6 Your Cards Shipped! Tracking #{tracking}', message: 'Great news {name}!\n\nYour cards from {break_name} have shipped!\nTracking: {tracking}\n\nExpected: 2-3 business days.\n{shop_name}' },
  reminder: { subject: '\u23F0 Break Starting in 1 Hour! {break_name}', message: 'Hey {name}! {break_name} starts in ONE HOUR!\nJoin us live on {platform}\n{shop_name}' },
  sold_out: { subject: '\uD83D\uDD25 SOLD OUT! {break_name}', message: '{name}, we just SOLD OUT our {break_name} break!\nNext break coming soon \u2014 reply for first access!\n{shop_name}' },
  results:  { subject: '\uD83D\uDCCA {break_name} Break Results + Your Cards', message: '{name}, here are the results!\n\n\uD83C\uDFB4 YOUR CARD(S): {card}\n\nShipping within 2 business days.\n{shop_name}' }
};

function loadTemplate() {
  const key = (document.getElementById('n-template') || {}).value;
  if (!key || key === 'custom') return;
  const t = TEMPLATES[key];
  if (!t) return;
  const subj = document.getElementById('n-subject'); if (subj) subj.value = t.subject;
  const msg  = document.getElementById('n-message'); if (msg)  msg.value  = t.message;
}

function saveNotifyChannels() {
  ['n-resend-key','n-from-email','n-twilio-sid','n-twilio-token','n-twilio-from','n-discord-webhook'].forEach(id => {
    const el = document.getElementById(id); if (el) localStorage.setItem('droppa-' + id, el.value.trim());
  });
  const updateBadge = (elId, keyId) => {
    const el = document.getElementById(elId);
    if (el && getKey(keyId)) { el.textContent = '\u2713 configured'; el.style.color = 'var(--grn)'; }
  };
  updateBadge('email-ch-status', 'n-resend-key');
  updateBadge('sms-ch-status',   'n-twilio-sid');
  updateBadge('discord-ch-status','n-discord-webhook');
  const st = document.getElementById('n-ch-status');
  if (st) { st.textContent = '\u2713 Channels saved'; st.style.color = 'var(--grn)'; }
  toast('Notification channels saved \u2713');
}

function loadNotifySettings() {
  ['n-resend-key','n-from-email','n-twilio-sid','n-twilio-token','n-twilio-from','n-discord-webhook'].forEach(id => {
    const el = document.getElementById(id); const v = getKey(id); if (el && v) el.value = v;
  });
  const updateBadge = (elId, keyId) => {
    const el = document.getElementById(elId);
    if (el && getKey(keyId)) { el.textContent = '\u2713 configured'; el.style.color = 'var(--grn)'; }
  };
  updateBadge('email-ch-status', 'n-resend-key');
  updateBadge('sms-ch-status',   'n-twilio-sid');
  updateBadge('discord-ch-status','n-discord-webhook');
}

function importCustomersFromWinners() {
  const winners  = JSON.parse(localStorage.getItem('droppa-winners')  || '[]');
  const existing = JSON.parse(localStorage.getItem('droppa-customers')|| '[]');
  let added = 0;
  winners.forEach(w => {
    if (!w.email && !w.phone) return;
    if (existing.find(c => c.email === w.email || c.name === w.name)) return;
    existing.push({ name: w.name, email: w.email, phone: w.phone, source: 'winner', ts: Date.now() });
    added++;
  });
  localStorage.setItem('droppa-customers', JSON.stringify(existing));
  renderCustomerList();
  toast(added + ' customers imported \u2713');
}

function renderCustomerList() {
  const q    = ((document.getElementById('n-cust-search') || {}).value || '').toLowerCase();
  const all  = JSON.parse(localStorage.getItem('droppa-customers') || '[]');
  const list = all.filter(c => !q || (c.name||'').toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q));
  const el   = document.getElementById('customer-list-display');
  if (!el) return;
  if (!list.length) { el.innerHTML = '<div style="color:var(--soft);text-align:center;padding:12px">No customers yet \u2014 import from Winners</div>'; }
  else el.innerHTML = list.slice(0,30).map(c =>
    '<div style="padding:5px 0;border-bottom:1px solid var(--ln2);display:flex;justify-content:space-between">' +
    '<span style="font-weight:600">' + c.name + '</span>' +
    '<span style="color:var(--soft);font-size:.7rem">' + (c.email||'') + (c.phone?' \u00b7 '+c.phone:'') + '</span></div>'
  ).join('');
  setElText('customer-count', all.length + ' customers \u00b7 ' + all.filter(c=>c.email).length + ' with email \u00b7 ' + all.filter(c=>c.phone).length + ' with phone');
}

async function sendNotification() {
  const sendTo     = (document.getElementById('n-send-to')   || {}).value || 'all';
  const subject    = ((document.getElementById('n-subject')  || {}).value || '').trim();
  const message    = ((document.getElementById('n-message')  || {}).value || '').trim();
  const viaEmail   = (document.getElementById('send-email')  || {}).checked;
  const viaSMS     = (document.getElementById('send-sms')    || {}).checked;
  const viaDisc    = (document.getElementById('send-discord')|| {}).checked;
  if (!message) { toast('Write a message first', true); return; }
  const btn    = document.getElementById('n-send-btn');
  const statusEl = document.getElementById('n-send-status');
  if (btn) btn.disabled = true;
  const shopName = getKey('set-name') || 'Your Break Host';
  const results  = [];

  // Build recipients list
  const winners   = JSON.parse(localStorage.getItem('droppa-winners')  || '[]');
  const customers = JSON.parse(localStorage.getItem('droppa-customers')|| '[]');
  let recipients = [];
  if (sendTo === 'test')      recipients = [{ name: 'Test', email: getKey('n-from-email'), phone: getKey('n-twilio-from') }];
  else if (sendTo === 'all')      recipients = customers;
  else if (sendTo === 'winners')  recipients = winners;
  else if (sendTo === 'paid')     recipients = winners.filter(w => w.paid === 'paid');
  else if (sendTo === 'unshipped')recipients = winners.filter(w => w.label === 'none');

  const personalize = (template, r) =>
    template.replace(/{name}/g, r.name||'there').replace(/{card}/g, r.cards||'your card')
      .replace(/{tracking}/g, r.tracking||'pending').replace(/{shop_name}/g, shopName)
      .replace(/{break_name}/g, r.breakTitle||'the break').replace(/{platform}/g, liveSession && liveSession.platform||'WhatNot');

  // Discord (one post)
  if (viaDisc) {
    const wh = getKey('n-discord-webhook');
    if (wh) {
      try {
        const discordBody = '**' + subject + '**\n\n' + personalize(message, { name: 'everyone' });
        await fetch(wh, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ content: discordBody.slice(0,2000) }) });
        results.push('Discord \u2713');
      } catch(e) { results.push('Discord \u2717'); }
    } else results.push('Discord: webhook not set');
  }

  // Email via Resend
  if (viaEmail) {
    const resendKey = getKey('n-resend-key');
    const fromEmail = getKey('n-from-email');
    if (!resendKey || !fromEmail) { results.push('Email: not configured'); }
    else {
      let sent = 0;
      for (const r of recipients.filter(x => x.email)) {
        try {
          const resp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + resendKey },
            body: JSON.stringify({ from: fromEmail, to: r.email, subject: personalize(subject, r),
              html: '<pre style="font-family:system-ui;white-space:pre-wrap">' + personalize(message, r) + '</pre>' })
          });
          const d = await resp.json();
          if (d.id) sent++;
        } catch(e) {}
      }
      results.push('Email: ' + sent + '/' + recipients.filter(x=>x.email).length + ' sent');
    }
  }

  // SMS via Twilio
  if (viaSMS) {
    const sid   = getKey('n-twilio-sid');
    const token = getKey('n-twilio-token');
    const from  = getKey('n-twilio-from');
    if (!sid || !token || !from) { results.push('SMS: Twilio not configured'); }
    else {
      let sent = 0;
      for (const r of recipients.filter(x => x.phone)) {
        try {
          const body = new URLSearchParams({ From: from, To: r.phone, Body: personalize(message, r).slice(0,160) });
          const resp = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json', {
            method: 'POST',
            headers: { 'Authorization': 'Basic ' + btoa(sid + ':' + token), 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
          });
          const d = await resp.json();
          if (!d.error_code) sent++;
        } catch(e) {}
      }
      results.push('SMS: ' + sent + '/' + recipients.filter(x=>x.phone).length + ' sent');
    }
  }

  // Log history
  const hist = JSON.parse(localStorage.getItem('droppa-notify-hist') || '[]');
  hist.unshift({ ts: new Date().toLocaleString(), subject, results: results.join(' \u00b7 '), count: recipients.length });
  localStorage.setItem('droppa-notify-hist', JSON.stringify(hist.slice(0,50)));
  renderNotifyHistory();
  if (statusEl) { statusEl.textContent = results.join(' \u00b7 ') || 'Pick a channel'; statusEl.style.color = results.some(r=>r.includes('\u2713')) ? 'var(--grn)' : 'var(--soft)'; }
  toast(results.join(' \u00b7 ') || 'Done');
  if (btn) btn.disabled = false;
}

function renderNotifyHistory() {
  const hist = JSON.parse(localStorage.getItem('droppa-notify-hist') || '[]');
  const el   = document.getElementById('notify-history');
  if (!el) return;
  if (!hist.length) { el.innerHTML = '<div style="color:var(--soft);text-align:center;padding:16px">No messages sent yet</div>'; return; }
  el.innerHTML = hist.map(h =>
    '<div style="padding:6px 0;border-bottom:1px solid var(--ln2)">' +
    '<div style="font-size:.76rem;font-weight:600">' + h.subject + '</div>' +
    '<div style="font-size:.68rem;color:var(--soft)">' + h.ts + ' \u00b7 ' + h.results + '</div></div>'
  ).join('');
}
