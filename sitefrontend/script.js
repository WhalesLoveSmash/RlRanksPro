/* RL Ranks Pro – front-end glue (no framework) */

// ---------- small helpers ----------
async function httpJson(url, opts) {
  const r = await fetch(url, opts);
  let data = null;
  try { data = await r.json(); } catch {}
  if (!r.ok) throw new Error((data && data.error) || `HTTP ${r.status}`);
  return data || {};
}

function parseRLTrackerUrl(u) {
  const m = (u || '').trim().match(/profile\/([^/]+)\/([^/]+)/i);
  if (!m) throw new Error('Invalid RLTracker profile URL');
  return { platform: m[1], pid: m[2] };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ---------- rank lookup ----------
let RANKS_CACHE = null;
async function loadRanks() {
  if (RANKS_CACHE) return RANKS_CACHE;
  const res = await fetch('/ranks.json');
  if (!res.ok) throw new Error('Failed to load ranks.json');
  RANKS_CACHE = await res.json();
  return RANKS_CACHE;
}

/**
 * Compute tier/division label from MMR.
 * Expects ranks.json like:
 * { "playlists": { "2v2": { "defaultTierWidth": 80, "tiers": [{ "name": "Diamond I", "min": 1000 }, ...] } } }
 * Logic: choose highest tier with min <= MMR, then split gap to next tier into 4 equal divisions (I..IV).
 */
function rankFromMMR(mmr, playlist, ranks) {
  const cfg = ranks.playlists?.[playlist];
  if (!cfg) return { tierName: 'Unranked', divName: null };
  const tiers = [...cfg.tiers].sort((a, b) => a.min - b.min);

  let idx = 0;
  for (let i = 0; i < tiers.length; i++) {
    if (mmr >= tiers[i].min) idx = i; else break;
  }
  const tier = tiers[idx];
  const nextMin = tiers[idx + 1]?.min ?? (tier.min + (cfg.defaultTierWidth || 100));
  const width = Math.max(4, nextMin - tier.min);
  const step = width / 4;

  const into = clamp(mmr - tier.min, 0, nextMin - tier.min - 1);
  const divIdx = Math.min(3, Math.floor(into / step)); // 0..3

  const divNames = ['Div I', 'Div II', 'Div III', 'Div IV'];
  return { tierName: tier.name, divName: divNames[divIdx] };
}

// ---------- projection ----------
function projectMMRPath(startMMR, games, baseWRPercent, regression01, perGameMMR = 9) {
  const pts = [];
  const wrNow = (1 - regression01) * (baseWRPercent / 100) + regression01 * 0.5; // steady pull to 50%
  for (let i = 0; i < games; i++) {
    const prev = i === 0 ? startMMR : pts[i - 1].mmr;
    const next = prev + (wrNow * perGameMMR) + ((1 - wrNow) * -perGameMMR);
    pts.push({ game: i + 1, mmr: Math.round(next) });
  }
  return pts;
}

// ---------- DOM refs ----------
const els = {
  url: document.querySelector('#rltracker-url'),
  fetchBtn: document.querySelector('#fetch-btn'),
  mmr: document.querySelector('#mmr'),
  wr: document.querySelector('#winrate'),
  name: document.querySelector('#displayName'),
  games: document.querySelector('#games'),
  reg: document.querySelector('#regression'),
  regLabel: document.querySelector('#regression-label'),
  title: document.querySelector('#title'),
  out: document.querySelector('#out'),
  currRank: document.querySelector('#current-label'),
  projRank: document.querySelector('#projected-label'),
  currMMR: document.querySelector('#currMMR'),
  currWR: document.querySelector('#currWR'),
  projMMR: document.querySelector('#projMMR'),
  projWR: document.querySelector('#projWR'),
  chartNote: document.querySelector('#chart'),
  predictBtn: document.querySelector('#btnPredict'),
  error: document.querySelector('#error-box')
};

function showError(msg) {
  if (!els.error) return;
  els.error.textContent = msg || '';
  els.error.style.display = msg ? 'block' : 'none';
}
function showOut() { if (els.out) els.out.classList.remove('hide'); }

// ---------- rendering ----------
function drawPathNote(path) {
  if (!els.chartNote) return;
  const last = path[path.length - 1];
  els.chartNote.textContent = `Projected MMR after ${path.length} games: ${last?.mmr ?? '—'}`;
}

async function renderProjection() {
  try {
    showError('');
    const ranks = await loadRanks();

    const current = parseInt(els.mmr.value || '0', 10);
    const wr = clamp(parseFloat(els.wr.value || '50'), 0, 100);
    const games = clamp(parseInt(els.games.value || '25', 10), 1, 200);
    const reg01 = clamp(parseInt(els.reg.value || '30', 10), 0, 100) / 100;

    const path = projectMMRPath(current, games, wr, reg01, 9);
    drawPathNote(path);
    showOut();

    const finalMMR = path[path.length - 1]?.mmr ?? current;

    // labels
    const cur = rankFromMMR(current, '2v2', ranks);
    const pro = rankFromMMR(finalMMR, '2v2', ranks);

    if (els.currRank) els.currRank.textContent = `${cur.tierName} • ${cur.divName}`;
    if (els.projRank) els.projRank.textContent = `${pro.tierName} • ${pro.divName}`;

    if (els.currMMR) els.currMMR.textContent = String(current);
    if (els.currWR) els.currWR.textContent = String(Math.round(wr));

    if (els.projMMR) els.projMMR.textContent = String(finalMMR);
    if (els.projWR) els.projWR.textContent = String(Math.round((1 - reg01) * (wr) + reg01 * 50));
  } catch (e) {
    showError(e.message || 'Projection failed');
  }
}

// ---------- actions ----------
async function doFetch() {
  try {
    showError('');
    const { platform, pid } = parseRLTrackerUrl(els.url.value);

    // Serverless endpoint scrapes RLTracker HTML; no API key needed.
    const data = await httpJson(`/profile/${encodeURIComponent(platform)}/${encodeURIComponent(pid)}`);

    if (data.currentMMR != null) els.mmr.value = String(data.currentMMR);
    if (data.recentWinPercent != null) els.wr.value = String(data.recentWinPercent);
    if (els.name && pid) els.name.value ||= pid;

    await renderProjection();
  } catch (e) {
    console.error(e.stack);
    const msg = e?.message || String(e);
    showError(`Profile fetch failed: ${msg}. Try the Manual backup form.`);
  }
}

// ---------- wire up ----------
if (els.fetchBtn) els.fetchBtn.addEventListener('click', doFetch);
if (els.predictBtn) els.predictBtn.addEventListener('click', renderProjection);

['input', 'change'].forEach(ev => {
  if (els.mmr) els.mmr.addEventListener(ev, renderProjection);
  if (els.wr) els.wr.addEventListener(ev, renderProjection);
  if (els.games) els.games.addEventListener(ev, renderProjection);
  if (els.reg) els.reg.addEventListener(ev, () => {
    if (els.regLabel) els.regLabel.textContent = `${els.reg.value}% • medium`;
    renderProjection();
  });
});

document.addEventListener('DOMContentLoaded', renderProjection);