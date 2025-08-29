// ----- Utilities -----
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

// ----- Rank lookup -----
let RANKS_CACHE = null;
async function loadRanks() {
  if (RANKS_CACHE) return RANKS_CACHE;
  const res = await fetch('/ranks.json');
  if (!res.ok) throw new Error('Failed to load ranks.json');
  RANKS_CACHE = await res.json();
  return RANKS_CACHE;
}
function rankFromMMR(mmr, playlist = '2v2', ranks) {
  const cfg = ranks.playlists?.[playlist];
  if (!cfg) return { tierName: 'Unranked', divName: null };
  const tiers = [...cfg.tiers].sort((a, b) => a.min - b.min);
  let idx = 0;
  for (let i = 0; i < tiers.length; i++) { if (mmr >= tiers[i].min) idx = i; else break; }
  const tier = tiers[idx];
  const nextMin = tiers[idx + 1]?.min ?? (tier.min + (cfg.defaultTierWidth || 100));
  const width = Math.max(4, nextMin - tier.min);
  const step = width / 4;
  const into = Math.max(0, Math.min(nextMin - tier.min - 1, mmr - tier.min));
  const divIdx = Math.min(3, Math.floor(into / step));
  const divNames = ['Div I', 'Div II', 'Div III', 'Div IV'];
  return { tierName: tier.name, divName: divNames[divIdx] };
}

// ----- Projection math -----
function projectMMRPath(startMMR, games, baseWR, regression01, perGameMMR = 9) {
  const pts = [];
  for (let i = 0; i < games; i++) {
    const wrNow = (1 - regression01) * (baseWR / 100) + regression01 * 0.5;
    const next = (pts[i - 1]?.mmr ?? startMMR) + (wrNow * perGameMMR) + ((1 - wrNow) * -perGameMMR);
    pts.push({ game: i + 1, mmr: Math.round(next) });
  }
  return pts;
}

// ----- DOM wiring -----
const els = {
  url: document.querySelector('#rltracker-url'),
  fetchBtn: document.querySelector('#fetch-btn'),
  mmrInput: document.querySelector('#mmr'),
  wrInput: document.querySelector('#winrate'),
  nameInput: document.querySelector('#displayName'),
  gamesInput: document.querySelector('#games'),
  regSlider: document.querySelector('#regression'),
  regLabel: document.querySelector('#regression-label'),
  chart: document.querySelector('#chart'),
  currentLabel: document.querySelector('#current-label'),
  projectedLabel: document.querySelector('#projected-label'),
  error: document.querySelector('#error-box')
};
function showError(msg) {
  if (!els.error) return;
  els.error.textContent = msg || '';
  els.error.style.display = msg ? 'block' : 'none';
}
function setCurrentAndProjectedLabels(ranks, currentMMR, projectedMMR) {
  const cur = rankFromMMR(currentMMR, '2v2', ranks);
  const pro = rankFromMMR(projectedMMR, '2v2', ranks);
  if (els.currentLabel) els.currentLabel.textContent = `${cur.tierName} • ${cur.divName}`;
  if (els.projectedLabel) els.projectedLabel.textContent = `${pro.tierName} • ${pro.divName}`;
}
function drawPath(path) {
  if (els.chart) {
    const last = path[path.length - 1];
    els.chart.textContent = `Projected MMR after ${path.length} games: ${last?.mmr ?? '—'}`;
  }
}
async function runProjection() {
  try {
    showError('');
    const ranks = await loadRanks();
    const current = parseInt(els.mmrInput.value || '0', 10);
    const wr = Math.max(0, Math.min(100, parseFloat(els.wrInput.value || '50')));
    const games = Math.max(1, parseInt(els.gamesInput.value || '25', 10));
    const reg = Math.max(0, Math.min(100, parseInt(els.regSlider.value || '50', 10))) / 100;
    const path = projectMMRPath(current, games, wr, reg, 9);
    drawPath(path);
    const finalMMR = path[path.length - 1]?.mmr ?? current;
    setCurrentAndProjectedLabels(ranks, current, finalMMR);
  } catch (e) {
    showError(e.message || 'Projection failed');
  }
}
async function doFetch() {
  try {
    showError('');
    const { platform, pid } = parseRLTrackerUrl(els.url.value);
    const data = await httpJson(`/profile/${encodeURIComponent(platform)}/${encodeURIComponent(pid)}`);
    if (data.currentMMR) els.mmrInput.value = String(data.currentMMR);
    if (data.recentWinPercent != null) els.wrInput.value = String(data.recentWinPercent);
    await runProjection();
  } catch (e) {
    showError(`Profile fetch failed: ${e.message}`);
  }
}
if (els.fetchBtn) els.fetchBtn.addEventListener('click', doFetch);
['input', 'change'].forEach(ev => {
  if (els.mmrInput) els.mmrInput.addEventListener(ev, runProjection);
  if (els.wrInput) els.wrInput.addEventListener(ev, runProjection);
  if (els.gamesInput) els.gamesInput.addEventListener(ev, runProjection);
  if (els.regSlider) els.regSlider.addEventListener(ev, () => {
    if (els.regLabel) els.regLabel.textContent = `${els.regSlider.value}% • medium`;
    runProjection();
  });
});
document.addEventListener('DOMContentLoaded', runProjection);