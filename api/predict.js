// api/predict.js
const { simulateSeries } = require('../lib/sim');
const data = require('../lib/ranks.json');

function bucketFromJson(mmr, playlistId=11){
  const pl = data.playlists.find(p => p.id === Number(playlistId));
  if (!pl) return {t:"Unknown", d:"—"};
  const R = pl.ranges;
  const topHi = R[0][3], botLo = R[R.length-1][2];

  // exact in-range
  for (const [t,d,lo,hi] of R){
    if (mmr >= lo && mmr <= hi) return {t,d};
  }
  // outside extremes
  if (mmr > topHi) return {t:"Above SSL", d:"—"};
  if (mmr < botLo) return {t:"Below Bronze I", d:"—"};

  // between gaps → snap DOWN to nearest lower bracket
  for (const [t,d,lo] of R){
    if (mmr >= lo) return {t,d};
  }
  return {t:"Unknown", d:"—"};
}
function toRankLabel(mmr, playlistId=11){
  const b = bucketFromJson(mmr, playlistId);
  return b.d !== "—" ? `${b.t} ${b.d}` : b.t;
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
      current:   { mmr, wr: Math.round(winPct),                         rank: toRankLabel(mmr, playlistId) },
      projected: { mmr: end, wr: Math.round(wrSeries[wrSeries.length-1]), rank: toRankLabel(end, playlistId) }
    };

    Object.entries(DEFAULT_HEADERS).forEach(([k,v])=>res.setHeader(k,v));
    res.status(200).send(JSON.stringify(payload));
  }catch(e){
    res.status(400).json({ error: e.message || 'Bad request' });
  }
};