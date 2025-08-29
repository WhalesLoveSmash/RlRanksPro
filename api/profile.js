// api/profile.js — resilient profile fetcher for Vercel (Node runtime)

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

function okJson(res, obj, status = 200) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.status(status).json(obj);
}

function bad(res, msg, status = 500, extra = {}) {
  okJson(res, { error: msg, ...extra }, status);
}

function parseProfileUrl(url) {
  if (!url) return null;
  const m = String(url).match(/profile\/([^/]+)\/([^/]+)/i);
  return m ? { platform: m[1], pid: m[2] } : null;
}

// Deep-walk any JSON object/array
function* walk(x) {
  if (!x) return;
  if (Array.isArray(x)) {
    for (const v of x) yield* walk(v);
  } else if (typeof x === 'object') {
    yield x;
    for (const k in x) yield* walk(x[k]);
  }
}

function extractFromNextData(nextData) {
  let rating = null;
  let wr = null;

  for (const node of walk(nextData)) {
    // Prefer explicit playlistId 11 (Ranked Doubles 2v2)
    const is2v2 =
      (typeof node?.playlistId === 'number' && node.playlistId === 11) ||
      (typeof node?.metadata?.name === 'string' && /2v2|Doubles/i.test(node.metadata.name)) ||
      (typeof node?.playlist === 'string' && /2v2|Doubles/i.test(node.playlist));

    if (!is2v2) continue;

    const stats = node.stats || node.Stats || node.statistics || {};

    // Try a bunch of common shapes
    const candRating =
      stats.rating?.value ??
      stats.mmr?.value ??
      stats.Rating?.value ??
      node.rating?.value ??
      node.rating ??
      null;

    const candWR =
      stats.winPercent?.value ??
      stats.winPercentage?.value ??
      stats.winRate?.value ??
      stats['Win %']?.value ??
      node.winPercent ??
      node.winRate ??
      null;

    if (Number.isFinite(candRating)) rating = Number(candRating);
    if (Number.isFinite(candWR)) wr = Number(candWR);

    if (rating != null && wr != null) break;
  }

  return { rating, wr };
}

async function fetchTrackerHTML(platform, pid) {
  const url = `https://rocketleague.tracker.network/rocket-league/profile/${encodeURIComponent(
    platform
  )}/${encodeURIComponent(pid)}/overview`;

  const resp = await fetch(url, {
    headers: {
      'user-agent': UA,
      'accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      referer: 'https://rocketleague.tracker.network/'
    }
  });

  const status = resp.status;
  const html = await resp.text();
  return { status, html, url };
}

async function fetchTrackerAPI(platform, pid, apiKey) {
  // Tracker Network public API (requires API key)
  const url = `https://public-api.tracker.gg/v2/rocket-league/standard/profile/${encodeURIComponent(
    platform
  )}/${encodeURIComponent(pid)}`;

  const resp = await fetch(url, {
    headers: {
      'user-agent': UA,
      'accept': 'application/json',
      'TRN-Api-Key': apiKey
    }
  });

  const status = resp.status;
  const text = await resp.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {}

  return { status, json, text, url };
}

module.exports = async function handler(req, res) {
  try {
    const method = (req.method || 'GET').toUpperCase();
    if (method !== 'GET') return bad(res, 'Method not allowed', 405);

    let { platform, pid, url } = req.query || {};
    if ((!platform || !pid) && url) {
      const parsed = parseProfileUrl(url);
      if (parsed) ({ platform, pid } = parsed);
    }
    if (!platform || !pid) {
      return bad(
        res,
        'Missing platform or pid. Pass ?platform=steam|epic|xbl|psn&pid=<id> or ?url=<rltracker profile url>.',
        400
      );
    }

    // 1) Try official API if TRN_API_KEY is configured
    const apiKey = process.env.TRN_API_KEY || process.env.TRACKER_API_KEY;
    if (apiKey) {
      const { status, json, text, url: hit } = await fetchTrackerAPI(platform, pid, apiKey);
      if (status === 200 && json) {
        // Find the 2v2 segment (playlistId === 11)
        const seg =
          json?.data?.segments?.find(
            (s) => s?.attributes?.playlistId === 11 || /2v2|Doubles/i.test(s?.metadata?.name || '')
          ) || null;

        const rating =
          seg?.stats?.rating?.value ??
          seg?.stats?.mmr?.value ??
          seg?.stats?.Rating?.value ??
          null;

        const wr =
          seg?.stats?.winPercent?.value ??
          seg?.stats?.winPercentage?.value ??
          seg?.stats?.winRate?.value ??
          null;

        if (Number.isFinite(rating)) {
          return okJson(res, {
            platform,
            pid,
            currentMMR: Number(rating),
            recentWinPercent: Number.isFinite(wr) ? Number(wr) : null,
            source: 'public-api.tracker.gg',
            fetchedAt: new Date().toISOString()
          });
        }
        // No rating in API — continue to scrape as fallback
      } else {
        // Helpful error detail
        return bad(
          res,
          `Tracker API error ${status}`,
          502,
          json || { body: text?.slice(0, 400), endpoint: hit }
        );
      }
    }

    // 2) Fallback: scrape the site HTML
    const { status, html, url: hit } = await fetchTrackerHTML(platform, pid);
    if (status >= 400) {
      return bad(res, `Upstream HTTP ${status}`, 502, { endpoint: hit });
    }

    // Look for Next.js payload
    const m = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
    );

    if (!m) {
      // This is the "fails faster" case: Cloudflare/anti-bot page returned 200 without Next data.
      return bad(res, 'Blocked by site (no embedded JSON). Try again or use TRN_API_KEY.', 502, {
        endpoint: hit
      });
    }

    let nextData;
    try {
      nextData = JSON.parse(m[1]);
    } catch (_) {
      return bad(res, 'Profile JSON parse error.', 500);
    }

    // Robust extraction
    let { rating, wr } = extractFromNextData(nextData);

    // As a last resort, try regex on the flattened JSON
    if (rating == null) {
      const flat = JSON.stringify(nextData);
      const rx =
        /"playlistId"\s*:\s*11[\s\S]*?"(?:rating|mmr)"[\s\S]*?"value"\s*:\s*(\d{3,4})/i;
      const mm = flat.match(rx);
      if (mm) rating = Number(mm[1]);
      const wrx =
        /"win(?:Percent|Percentage|Rate)"[\s\S]*?"value"\s*:\s*(\d{1,3})/i;
      const wm = flat.match(wrx);
      if (wm) wr = Number(wm[1]);
    }

    if (!Number.isFinite(rating)) {
      return bad(res, 'Could not find 2v2 rating on page JSON.', 500);
    }

    return okJson(res, {
      platform,
      pid,
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