// api/predict.js
const { simulateSeries } = require('../lib/sim');
const data = require('../lib/ranks.json');

// helper: label rank from playlist ranges
function toRankLabel(mmr, playlistId=11) {
  const pl = data.playlists.find(p => p.id === Number(playlistId));
  if (!pl) return "Unknown";
  const R = pl.ranges;
  for (const [tier, div, lo, hi] of R){
    if (mmr >= lo && mmr <= hi) {
      return div === "—" ? tier : `${tier} ${div}`;
    }
  }
  // below/above handling
  const bottom = R[R.length-1][2], top = R[0][3];
  if (mmr < bottom) return "Below Bronze I";
  if (mmr > top) return "Above SSL";
  return "Unknown";
}

const DEFAULT_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

module.exports = async (req, res) => {
  try{
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    let { mmr, winPct, games=25, regress=30, playlistId=11 } = body;

    mmr = Number(mmr); winPct = Number(winPct);
    games = Math.max(1, Math.min(200, Number(games)||25));
    regress = Math.max(0, Math.min(100, Number(regress)||30));
    playlistId = Number(playlistId) || 11;

    if(!Number.isFinite(mmr)) throw new Error("Valid mmr required");
    if(!Number.isFinite(winPct)) throw new Error("Valid winPct required");

    const { mmrSeries, wrSeries } = simulateSeries(mmr, winPct, games, regress);
    const end = mmrSeries[mmrSeries.length-1];

    const payload = {
      playlistId,
      mmrSeries,
      wrSeries,
      current: { mmr, wr: Math.round(winPct), rank: toRankLabel(mmr, playlistId) },
      projected: { mmr: end, wr: Math.round(wrSeries[wrSeries.length-1]), rank: toRankLabel(end, playlistId) }
    };

    Object.entries(DEFAULT_HEADERS).forEach(([k,v])=>res.setHeader(k,v));
    res.status(200).send(JSON.stringify(payload));
  }catch(e){
    res.status(400).json({ error: e.message || 'Bad request' });
  }
};