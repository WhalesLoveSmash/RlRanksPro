// Lightweight scrape with a fallback proxy.
// 1) Try direct HTTPS GET (no compression) against:
//    - rocketleague.tracker.network
//    - tracker.gg
// 2) If blocked (403/404/503) or parsing fails, try:
//    - https://r.jina.ai/http/<original-url>
// Works on Vercel Hobby (no puppeteer, no extra deps).

const https = require('https');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function fetchHtml(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 4) return reject(new Error('Too many redirects'));

    const u = new URL(url);
    const req = https.get(
      {
        hostname: u.hostname,
        path: u.pathname + (u.search || ''),
        protocol: u.protocol,
        method: 'GET',
        headers: {
          'Accept-Encoding': 'identity', // no gzip/brotli so we can parse
          'User-Agent': UA,
          'Accept':
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Referer': 'https://rocketleague.tracker.network/'
        }
      },
      (res) => {
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

// Proxy fetch via r.jina.ai (returns readable HTML/text content)
function fetchViaJina(originalUrl) {
  const proxyUrl = 'https://r.jina.ai/http/' + originalUrl.replace(/^https?:\/\//, '');
  return new Promise((resolve, reject) => {
    const u = new URL(proxyUrl);
    const req = https.get(
      {
        hostname: u.hostname,
        path: u.pathname + (u.search || ''),
        protocol: u.protocol,
        method: 'GET',
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache'
        }
      },
      (res) => {
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
  let m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  m = html.match(/window\.__NEXT_DATA__\s*=\s*({[\s\S]*?});/i);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  return null;
}

function pick2v2FromNext(next) {
  try {
    const txt = JSON.stringify(next);
    const mm =
      txt.match(/"playlist(?:Id|ID)"\s*:\s*11[\s\S]{0,300}?"mmr"\s*:\s*(\d{3,5})/i) ||
      txt.match(/"mmr"\s*:\s*(\d{3,5})[\s\S]{0,300}"playlist(?:Id|ID)"\s*:\s*11/i);
    const win = txt.match(/"win(?:Rate|Percent|sPercent)"\s*:\s*(\d{1,3}(?:\.\d+)?)/i);
    return {
      mmr2v2: mm ? Number(mm[1]) : null,
      recentWinPct: win ? Number(win[1]) : null
    };
  } catch {
    return { mmr2v2: null, recentWinPct: null };
  }
}

// Very loose text fallback (works on r.jina.ai output)
function pick2v2FromText(text) {
  // Try to find the 2v2 section and grab a 3–5 digit number near it
  const sect = text.match(/Ranked\s*Doubles\s*2v2[\s\S]{0,1000}/i);
  const block = (sect ? sect[0] : text.slice(0, 4000));
  const mmr = block.match(/\b(\d{3,5})\b(?!\s*%)/); // number not followed by %
  const wr = block.match(/(\d{1,3}(?:\.\d+)?)\s*%[^%]{0,30}(?:Win|WR|Win\s*Rate)?/i);
  return {
    mmr2v2: mmr ? Number(mmr[1]) : null,
    recentWinPct: wr ? Number(wr[1]) : null
  };
}

async function tryHost(host, platform, pid) {
  const url = `https://${host}/rocket-league/profile/${encodeURIComponent(platform)}/${encodeURIComponent(pid)}/overview`;
  const direct = await fetchHtml(url);
  return { url, direct };
}

module.exports = async (req, res) => {
  try {
    const { platform, pid } = req.query || {};
    if (!platform || !pid) return res.status(400).json({ error: 'Missing platform or pid' });

    const hosts = [
      'rocketleague.tracker.network',
      'tracker.gg'
    ];

    // 1) Try direct
    for (const host of hosts) {
      const { url, direct } = await tryHost(host, platform, pid);
      if (direct.status === 200) {
        const next = extractNext(direct.body);
        let { mmr2v2, recentWinPct } = next ? pick2v2FromNext(next) : { mmr2v2: null, recentWinPct: null };
        if (!mmr2v2) {
          const p = pick2v2FromText(direct.body);
          mmr2v2 = p.mmr2v2 ?? mmr2v2;
          recentWinPct = p.recentWinPct ?? recentWinPct;
        }
        if (mmr2v2) {
          res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
          return res.json({
            platform,
            pid: decodeURIComponent(pid),
            currentMMR: mmr2v2,
            recentWinPercent: recentWinPct ?? null,
            source: url,
            fetchedAt: new Date().toISOString()
          });
        }
      }
      // if blocked or parsing failed, try proxy
      const prox = await fetchViaJina(url);
      if (prox.status === 200 && prox.body) {
        const next = extractNext(prox.body); // sometimes preserved
        let { mmr2v2, recentWinPct } = next ? pick2v2FromNext(next) : { mmr2v2: null, recentWinPct: null };
        if (!mmr2v2) {
          const p = pick2v2FromText(prox.body);
          mmr2v2 = p.mmr2v2 ?? mmr2v2;
          recentWinPct = p.recentWinPct ?? recentWinPct;
        }
        if (mmr2v2) {
          res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
          return res.json({
            platform,
            pid: decodeURIComponent(pid),
            currentMMR: mmr2v2,
            recentWinPercent: recentWinPct ?? null,
            source: `proxy:r.jina.ai -> ${url}`,
            fetchedAt: new Date().toISOString()
          });
        }
      }
    }

    // If we get here, both direct and proxy failed to yield a number
    return res.status(502).json({
      error: 'Upstream not OK',
      status: 0,
      tried: hosts
    });
  } catch (e) {
    res.status(500).json({ error: 'Scrape failed', detail: String(e) });
  }
};