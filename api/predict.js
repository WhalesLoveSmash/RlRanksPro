const RANKS = require('../ranks.json');

function rankFromMMR(mmr, playlist = '2v2') {
  const cfg = RANKS.playlists?.[playlist];
  if (!cfg) return { tier: 'Unranked', div: null };
  const tiers = [...cfg.tiers].sort((a, b) => a.min - b.min);

  let idx = 0;
  for (let i = 0; i < tiers.length; i++) {
    if (mmr >= tiers[i].min) idx = i; else break;
  }
  const tier = tiers[idx];
  const nextMin = tiers[idx + 1]?.min ?? (tier.min + (cfg.defaultTierWidth || 100));
  const width = Math.max(4, nextMin - tier.min);
  const step = width / 4;
  const into = Math.max(0, Math.min(nextMin - tier.min - 1, mmr - tier.min));
  const divIdx = Math.min(3, Math.floor(into / step));
  const divNames = ['Div I', 'Div II', 'Div III', 'Div IV'];
  return { tier: tier.name, div: divNames[divIdx] };
}

function simulateSeries(startMMR, baseWinPct, games, regressPct, perGame = 9) {
  const wrSeries = [], mmrSeries = [];
  const r = Math.max(0, Math.min(100, Number(regressPct) || 0)) / 100;
  const wrNow = (1 - r) * (baseWinPct / 100) + r * 0.5;

  let mmr = Number(startMMR);
  for (let i = 0; i < games; i++) {
    mmr += wrNow * perGame + (1 - wrNow) * -perGame;
    wrSeries.push(Math.round(wrNow * 100));
    mmrSeries.push(Math.round(mmr));
  }
  return { wrSeries, mmrSeries };
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    let { mmr, winPct, games = 25, regress = 30 } = body;

    if (!Number.isFinite(Number(mmr))) throw new Error('Valid mmr required');
    if (!Number.isFinite(Number(winPct))) throw new Error('Valid winPct required');

    games = Math.max(1, Math.min(200, Number(games)));
    const { wrSeries, mmrSeries } = simulateSeries(Number(mmr), Number(winPct), games, Number(regress));
    const end = mmrSeries[mmrSeries.length - 1];

    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.status(200).json({
      current:   { mmr: Number(mmr), wr: Math.round(Number(winPct)), rank: rankFromMMR(Number(mmr)) },
      projected: { mmr: end, wr: wrSeries[wrSeries.length - 1],      rank: rankFromMMR(end) },
      mmrSeries, wrSeries
    });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Bad request' });
  }
};