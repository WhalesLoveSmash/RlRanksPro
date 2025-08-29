// Lightweight scraper: plain HTTPS GET (no compression), follows redirects,
// tries rocketleague.tracker.network first then tracker.gg, and parses __NEXT_DATA__.
// No puppeteer, no extra deps — deploys fast on Vercel Hobby.

const https = require('https');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function fetchHtml(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 3) return reject(new Error('Too many redirects'));

    const u = new URL(url);
    const req = https.get(
      {
        hostname: u.hostname,
        path: u.pathname + (u.search || ''),
        protocol: u.protocol,
        method: 'GET',
        headers: {
          // Avoid gzip/brotli so we can string-parse the HTML.
          'Accept-Encoding': 'identity',
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Referer': 'https://rocketleague.tracker.network/'
        },
      },
      (res) => {
        // Handle redirects
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          const loc = res.headers.location;
          res.resume();
          if (!loc) return reject(new Error('Redirect without Location'));
          const next = loc.startsWith('http') ? loc : new URL(loc, url).href;
          return resolve(fetchHtml(next, redirects + 1));
        }

        let chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode || 0, body });
        });
      }
    );

    req.on('error', reject);
  });
}

function extractNext(html) {
  // Try standard Next.js script first
  let m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (m) {
    try { return JSON.parse(m[1]); } catch {}
  }
  // Fallback: window.__NEXT_DATA__ assignment
  m = html.match(/window\.__NEXT_DATA__\s*=\s*({[\s\S]*?});/i);
  if (m) {
    try { return JSON.parse(m[1]); } catch {}
  }
  return null;
}

function pick2v2FromNext(next) {
  try {
    const txt = JSON.stringify(next);
    // playlist 11 is 2v2
    const mm =
      txt.match(/"playlist(?:Id|ID)"\s*:\s*11[\s\S]{0,300}?"mmr"\s*:\s*(\d{3,5})/i) ||
      txt.match(/"mmr"\s*:\s*(\d{3,5})[\s\S]{0,300}"playlist(?:Id|ID)"\s*:\s*11/i);
    const win = txt.match(/"win(?:Rate|Percent|sPercent)"\s*:\s*(\d{1,3}(?:\.\d+)?)/i);
    return {
      mmr2v2: mm ? Number(mm[1]) : null,
      recentWinPct: win ? Number(win[1]) : null,
    };
  } catch {
    return { mmr2v2: null, recentWinPct: null };
  }
}

function pick2v2FromHtml(html) {
  // Very loose fallback if NEXT_DATA parsing fails
  const sect = html.match(/Ranked\s*Doubles\s*2v2([\s\S]{0,800})/i);
  if (!sect) return { mmr2v2: null, recentWinPct: null };
  const block = sect[1];
  const mmr = block.match(/(\d{3,5}(?:,\d{3})?)/);
  const wr = block.match(/(\d{1,3}(?:\.\d+)?)\s*%[^%]{0,40}(?:Win|WR|Win\s*Rate)/i);
  return {
    mmr2v2: mmr ? Number(mmr[1].replace(/,/g, '')) : null,
    recentWinPct: wr ? Number(wr[1]) : null,
  };
}

async function tryHost(host, platform, pid) {
  const url = `https://${host}/rocket-league/profile/${encodeURIComponent(platform)}/${encodeURIComponent(pid)}/overview`;
  const { status, body } = await fetchHtml(url);
  return { status, body, url };
}

module.exports = async (req, res) => {
  try {
    const { platform, pid } = req.query || {};
    if (!platform || !pid) return res.status(400).json({ error: 'Missing platform or pid' });

    // 1) RL Tracker, 2) TrackerGG canonical
    const hosts = [
      'rocketleague.tracker.network',
      'tracker.gg'
    ];

    let result = null;
    for (const host of hosts) {
      result = await tryHost(host, platform, pid);
      if (result.status === 200) break;
      // try next host on common WAF statuses
      if (![403, 404, 503].includes(result.status)) break;
    }

    if (!result || result.status !== 200) {
      return res.status(result?.status || 502).json({
        error: 'Upstream not OK',
        status: result?.status || 0,
        tried: hosts
      });
    }

    const nextData = extractNext(result.body);
    let { mmr2v2, recentWinPct } = nextData ? pick2v2FromNext(nextData) : { mmr2v2: null, recentWinPct: null };

    if (!mmr2v2) {
      const p = pick2v2FromHtml(result.body);
      mmr2v2 = p.mmr2v2 ?? mmr2v2;
      recentWinPct = p.recentWinPct ?? recentWinPct;
    }

    if (!mmr2v2) {
      return res.status(502).json({ error: 'Could not parse 2v2 MMR from page data' });
    }

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    res.json({
      platform,
      pid: decodeURIComponent(pid),
      currentMMR: mmr2v2,
      recentWinPercent: recentWinPct ?? null,
      source: result.url,
      fetchedAt: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: 'Scrape failed', detail: String(e) });
  }
};
