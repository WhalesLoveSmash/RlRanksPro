// api/profile.js
const DEFAULT_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 's-maxage=1800, stale-while-revalidate=86400'
};

// extract 2v2 from Tracker JSON
function pickDoubles2v2(json){
  const segs = json?.data?.segments;
  if (!Array.isArray(segs)) throw new Error("No segments in API response.");

  const target = segs.find(s => {
    const nm = (s?.metadata?.name || "").toLowerCase();
    return /ranked/.test(nm) && /(2v2|doubles)/.test(nm);
  }) || segs.find(s => String(s?.metadata?.playlistId ?? s?.attributes?.playlistId) === "11");

  if (!target) throw new Error("Couldn't find Ranked 2v2 in your profile.");

  const stats = target.stats || {};
  const mmr = Number(
    (stats.rating?.value ?? stats.mmr?.value ?? stats.rankScore?.value)
  );
  if (!Number.isFinite(mmr)) throw new Error("2v2 MMR missing in API.");

  let winPct = Number(stats.winRatio?.value);
  if (!Number.isFinite(winPct)) {
    const wins = Number(stats.wins?.value);
    const losses = Number(stats.losses?.value);
    if (Number.isFinite(wins) && Number.isFinite(losses) && (wins+losses)>0) {
      winPct = (wins/(wins+losses))*100;
    }
  }

  return { mmr: Math.round(mmr), winPct: Number.isFinite(winPct) ? Math.round(winPct) : null };
}

module.exports = async (req, res) => {
  try{
    const { platform, pid } = req.query;
    if(!platform || !pid){ res.status(400).json({ error: "platform and pid required" }); return; }

    const url = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/${platform}/${encodeURIComponent(pid)}`;
    const headers = { 'User-Agent': 'RLRanksPro/1.0 (+https://rlranks.pro)' };
    if (process.env.TRN_API_KEY) headers['TRN-Api-Key'] = process.env.TRN_API_KEY;

    const r = await fetch(url, { headers });
    if(!r.ok){
      const txt = await r.text().catch(()=> '');
      throw new Error(`Tracker API ${r.status}: ${txt.slice(0,200)}`);
    }
    const json = await r.json();
    const out = pickDoubles2v2(json);

    res.setHeader('access-control-allow-origin','*');
    Object.entries(DEFAULT_HEADERS).forEach(([k,v])=>res.setHeader(k,v));
    res.status(200).send(JSON.stringify(out));
  }catch(e){
    res.setHeader('access-control-allow-origin','*');
    res.status(500).json({ error: e.message || 'Server error' });
  }
};