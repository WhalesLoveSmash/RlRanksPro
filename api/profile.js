// api/profile.js — robust profile fetcher for Vercel (Node, CommonJS)

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

function ok(res, obj, status = 200) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.status(status).json(obj);
}
function bad(res, msg, status = 500, extra = {}) {
  ok(res, { error: msg, ...extra }, status);
}

function parseProfileUrl(url) {
  if (!url) return null;
  const m = String(url).match(/profile\/([^/]+)\/([^/]+)/i);
  return m ? { platform: m[1], pid: m[2] } : null;
}

// ----- helpers -----
function* walk(x) {
  if (!x) return;
  if (Array.isArray(x)) for (const v of x) yield* walk(v);
  else if (typeof x === 'object') { yield x; for (const k in x) yield* walk(x[k]); }
}

function extractFromNextData(nextData) {
  let rating = null, wr = null;
  for (const node of walk(nextData)) {
    const is2v2 =
      (typeof node?.playlistId === 'number' && node.playlistId === 11) ||
      (typeof node?.metadata?.name === 'string' && /2v2|Doubles/i.test(node.metadata.name)) ||
      (typeof node?.playlist === 'string' && /2v2|Doubles/i.test(node.playlist));
    if (!is2v2) continue;

    const s = node.stats || node.Stats || node.statistics || {};
    const candR = s.rating?.value ?? s.mmr?.value ?? s.Rating?.value ?? node.rating?.value ?? node.rating;
    const candW = s.winPercent?.value ?? s.winPercentage?.value ?? s.winRate?.value ?? node.winPercent ?? node.winRate;

    if (Number.isFinite(candR)) rating = Number(candR);
    if (Number.isFinite(candW)) wr = Number(candW);
    if (rating != null && wr != null) break;
  }
  return { rating, wr };
}

async function fetchTrackerHTML(platform, pid) {
  const url = `https://rocketleague.tracker.network/rocket-league/profile/${encodeURIComponent(platform)}/${encodeURIComponent(pid)}/overview`;
  const resp = await fetch(url, {
    headers: {
      'user-agent': UA,
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      referer: 'https://rocketleague.tracker.network/'
    }
  });
  const status = resp.status;
  const html = await resp.text();
  return { status, html, url };
}

async function fetchTrackerAPI(platform, pid, apiKey) {
  const url = `https://public-api.tracker.gg/v2/rocket-league/standard/profile/${encodeURIComponent(platform)}/${encodeURIComponent(pid)}`;
  const resp = await fetch(url, {
    headers: { 'user-agent': UA, 'accept': 'application/json', 'TRN-Api-Key': apiKey }
  });
  const status = resp.status;
  const text = await resp.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status, json, text, url };
}

// ----- handler -----
module.exports = async function handler(req, res) {
  try {
    if ((req.method || 'GET').toUpperCase() !== 'GET') return bad(res, 'Method not allowed', 405);

    let { platform, pid, url, mode } = req.query || {};
    if ((!platform || !pid) && url) {
      const parsed = parseProfileUrl(url);
      if (parsed) ({ platform, pid } = parsed);
    }
    if (!platform || !pid) return bad(res, 'Missing platform or pid. Pass ?platform=&pid= or ?url=', 400);

    const apiKey = process.env.TRN_API_KEY || process.env.TRACKER_API_KEY;
    const wantAPI = mode === 'api' || (mode !== 'scrape' && !!apiKey);

    // 1) Try official API (only if key is present and we didn't force scrape)
    if (wantAPI) {
      const { status, json, text, url: endpoint } = await fetchTrackerAPI(platform, pid, apiKey);
      if (status === 200 && json) {
        const seg = json?.data?.segments?.find(
          s => s?.attributes?.playlistId === 11 || /2v2|Doubles/i.test(s?.metadata?.name || '')
        );
        const rating = seg?.stats?.rating?.value ?? seg?.stats?.mmr?.value ?? seg?.stats?.Rating?.value;
        const wr = seg?.stats?.winPercent?.value ?? seg?.stats?.winPercentage?.value ?? seg?.stats?.winRate?.value;

        if (Number.isFinite(rating)) {
          return ok(res, {
            platform, pid,
            currentMMR: Number(rating),
            recentWinPercent: Number.isFinite(wr) ? Number(wr) : null,
            source: 'public-api.tracker.gg',
            fetchedAt: new Date().toISOString()
          });
        }
        // API returned but no rating → fall through to scraping
      } else if (mode === 'api') {
        // If user forced API, report it verbosely
        const snippet = (json ? JSON.stringify(json) : text || '').slice(0, 260);
        return bad(res, `Tracker API ${status}: ${snippet}`, 502, { endpoint });
      }
      // Else: API failed → silently try scrape next
    }

    // 2) Fallback: scrape profile HTML
    const { status: hStatus, html, url: page } = await fetchTrackerHTML(platform, pid);
    if (hStatus >= 400) return bad(res, `Upstream HTTP ${hStatus}`, 502, { endpoint: page });

    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return bad(res, 'Blocked by site (no embedded JSON). Add TRN_API_KEY or try later.', 502, { endpoint: page });

    let nextData;
    try { nextData = JSON.parse(m[1]); } catch { return bad(res, 'Profile JSON parse error.', 500); }

    // Extract
    let { rating, wr } = extractFromNextData(nextData);
    if (rating == null) {
      const flat = JSON.stringify(nextData);
      const mm = flat.match(/"playlistId"\s*:\s*11[\s\S]*?"(?:rating|mmr)"[\s\S]*?"value"\s*:\s*(\d{3,4})/i);
      if (mm) rating = Number(mm[1]);
      const wm = flat.match(/"win(?:Percent|Percentage|Rate)"[\s\S]*?"value"\s*:\s*(\d{1,3})/i);
      if (wm) wr = Number(wm[1]);
    }
    if (!Number.isFinite(rating)) return bad(res, 'Could not find 2v2 rating on page JSON.', 500);

    return ok(res, {
      platform, pid,
      currentMMR: Number(rating),
      recentWinPercent: Number.isFinite(wr) ? Number(wr) : null,
      source: 'rocketleague.tracker.network',
      fetchedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('api/profile fatal:', err);
    return bad(res, 'Unexpected server error.', 500);
  }
};