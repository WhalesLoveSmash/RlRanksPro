// api/predict.js — self-contained

const RANGES = require('../ranks.json').playlists[0].ranges;

// Compute label from the ranges table (playlistId 11 = 2v2)
function toRankLabel(mmr) {
  // exact in-range first
  for (const [tier, div, lo, hi] of RANGES) {
    if (mmr >= lo && mmr <= hi) return div !== "—" ? `${tier} ${div}` : tier;
  }
  // above / below
  if (mmr > RANGES[0][3]) return "Above SSL";
  if (mmr < RANGES[RANGES.length-1][2]) return "Below Bronze I";
  // snap down to nearest lower bracket
  for (const [tier, div, lo] of RANGES) {
    if (mmr >= lo) return div !== "—" ? `${tier} ${div}` : tier;
  }
  return "Unknown";
}

// Simple projection (same math as client)
function simulateSeries(startMMR, baseWinPct, games, regressPct, perGame = 9) {
  const wrSeries = [];
  const mmrSeries = [];
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
      current:   { mmr: Number(mmr), wr: Math.round(Number(winPct)), rank: toRankLabel(Number(mmr)) },
      projected: { mmr: end, wr: wrSeries[wrSeries.length-1],        rank: toRankLabel(end) },
      mmrSeries, wrSeries
    });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Bad request' });
  }
};