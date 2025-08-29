const https = require('https');

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' } }, (r) => {
      let data = '';
      r.on('data', (c) => (data += c));
      r.on('end', () => resolve({ status: r.statusCode, body: data }));
    }).on('error', reject);
  });
}

function extractFromNextData(html) {
  // RLTracker is Next.js; the page embeds a __NEXT_DATA__ JSON blob.
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

function find2v2MMR(nextData) {
  // Be flexible: look through any plausible nodes for playlist 11 (Ranked Doubles 2v2).
  const text = JSON.stringify(nextData);
  // First: try “mmr” near playlistId 11
  const mm = text.match(/"playlist(?:Id|ID)"\s*:\s*11[\s\S]{0,200}?"mmr"\s*:\s*(\d{3,5})/i)
            || text.match(/"mmr"\s*:\s*(\d{3,5})[\s\S]{0,200}"playlist(?:Id|ID)"\s*:\s*11/i);
  const win = text.match(/"win(?:Rate|Percent)"\s*:\s*(\d{1,3}(?:\.\d+)?)/i);
  return {
    mmr2v2: mm ? Number(mm[1]) : null,
    recentWinPct: win ? Number(win[1]) : null
  };
}

module.exports = async (req, res) => {
  try {
    const { platform, pid } = req.query || {};
    if (!platform || !pid) return res.status(400).json({ error: 'Missing platform or pid' });

    const profileUrl = `https://rocketleague.tracker.network/rocket-league/profile/${encodeURIComponent(platform)}/${encodeURIComponent(pid)}/overview`;
    const { status, body } = await fetchHtml(profileUrl);
    if (status !== 200) return res.status(status).json({ error: 'Upstream not 200', status, url: profileUrl });

    const nextData = extractFromNextData(body);
    if (!nextData) return res.status(502).json({ error: 'Could not find __NEXT_DATA__', url: profileUrl });

    const { mmr2v2, recentWinPct } = find2v2MMR(nextData);
    if (!mmr2v2) return res.status(502).json({ error: 'Could not parse 2v2 MMR', url: profileUrl });

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    res.json({
      platform,
      pid: decodeURIComponent(pid),
      currentMMR: mmr2v2,
      recentWinPercent: recentWinPct ?? null,
      source: 'rocketleague.tracker.network',
      fetchedAt: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: 'Scrape failed', detail: String(e) });
  }
};