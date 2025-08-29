const https = require('https');
const zlib = require('zlib');
const MAX_REDIRECTS = 3;

function fetchHtml(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          // Avoid compressed responses so we can regex the HTML safely.
          'Accept-Encoding': 'identity',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      },
      (res) => {
        // Handle redirects
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          if (redirects >= MAX_REDIRECTS) return reject(new Error('Too many redirects'));
          const next = res.headers.location;
          if (!next) return reject(new Error('Redirect without Location header'));
          res.resume(); // drain
          return resolve(fetchHtml(next.startsWith('http') ? next : new URL(next, url).href, redirects + 1));
        }

        let chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          let body = buf.toString('utf8');
          resolve({ status: res.statusCode, body });
        });
      }
    );
    req.on('error', reject);
  });
}

function extractNextJson(html) {
  // 1) Standard Next.js script
  let m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (m) {
    try { return JSON.parse(m[1]); } catch {}
  }
  // 2) Inline window assignment (rare)
  m = html.match(/window\.__NEXT_DATA__\s*=\s*({[\s\S]*?});/i);
  if (m) {
    try { return JSON.parse(m[1]); } catch {}
  }
  return null;
}

function find2v2(nextData) {
  const text = JSON.stringify(nextData);

  // Try to find an object with playlist id 11 (2v2) and an mmr near it
  const mm =
    text.match(/"playlist(?:Id|ID)"\s*:\s*11[\s\S]{0,300}?"mmr"\s*:\s*(\d{3,5})/i) ||
    text.match(/"mmr"\s*:\s*(\d{3,5})[\s\S]{0,300}"playlist(?:Id|ID)"\s*:\s*11/i);

  // Win% often appears as winRate or winPercent
  const win =
    text.match(/"win(?:Rate|Percent)"\s*:\s*(\d{1,3}(?:\.\d+)?)/i) ||
    text.match(/"winsPercent"\s*:\s*(\d{1,3}(?:\.\d+)?)/i);

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
    if (status !== 200) {
      return res.status(status || 500).json({ error: 'Upstream not OK', status, url: profileUrl });
    }

    const nextData = extractNextJson(body);
    if (!nextData) {
      return res.status(502).json({ error: 'Could not find Next.js data on page', url: profileUrl });
    }

    const { mmr2v2, recentWinPct } = find2v2(nextData);
    if (!mmr2v2) {
      return res.status(502).json({ error: 'Could not parse 2v2 MMR from page data', url: profileUrl });
    }

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