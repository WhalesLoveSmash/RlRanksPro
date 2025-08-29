// api/profile.js — Rocket League scrape-only (no TRN API)

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

function* walk(x) {
  if (!x) return;
  if (Array.isArray(x)) for (const v of x) yield* walk(v);
  else if (typeof x === 'object') { yield x; for (const k in x) yield* walk(x[k]); }
}

function extractFromNextData(nextData) {
  let rating = null, wr = null;
  for (const node of walk(nextData)) {
    const is2v2 =
      node?.playlistId === 11 ||
      node?.attributes?.playlistId === 11 ||
      (typeof node?.metadata?.name === 'string' && /2v2|Doubles/i.test(node.metadata.name)) ||
      (typeof node?.playlist === 'string' && /2v2|Doubles/i.test(node.playlist)) ||
      (typeof node?.attributes?.playlist === 'string' && /2v2|Doubles/i.test(node.attributes.playlist));
    if (!is2v2) continue;

    const s =
      node.stats ||
      node.Stats ||
      node.statistics ||
      node.data?.stats ||
      node.attributes?.stats ||
      {};

    const candR =
      s.rating?.value ??
      s.rating ??
      s.mmr?.value ??
      s.mmr ??
      s.Rating?.value ??
      node.rating?.value ??
      node.rating ??
      node.mmr?.value ??
      node.mmr;

    const candW =
      s.winPercent?.value ??
      s.winPercent ??
      s.winPercentage?.value ??
      s.winPercentage ??
      s.winRate?.value ??
      s.winRate ??
      node.winPercent ??
      node.winPercentage ??
      node.winRate;

    if (Number.isFinite(candR)) rating = Number(candR);
    if (Number.isFinite(candW)) wr = Number(candW);
    if (rating != null && wr != null) break;
  }
  return { rating, wr };
}

module.exports = async function handler(req, res) {
  try {
    if ((req.method || 'GET').toUpperCase() !== 'GET') return bad(res, 'Method not allowed', 405);

    let { platform, pid, url } = req.query || {};
    if ((!platform || !pid) && url) {
      const m = String(url).match(/profile\/([^/]+)\/([^/]+)/i);
      if (m) { platform = m[1]; pid = m[2]; }
    }
    if (!platform || !pid) return bad(res, 'Missing platform or pid. Pass ?platform=&pid= or ?url=', 400);

    const pageUrl = `https://rocketleague.tracker.network/rocket-league/profile/${encodeURIComponent(platform)}/${encodeURIComponent(pid)}/overview`;
    const r = await fetch(pageUrl, {
      headers: {
        'user-agent': UA,
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        referer: 'https://rocketleague.tracker.network/'
      }
    });

    if (!r.ok) return bad(res, `Upstream HTTP ${r.status}`, 502, { endpoint: pageUrl });

    const html = await r.text();
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return bad(res, 'Blocked by site (no embedded JSON).', 502, { endpoint: pageUrl });

    let nextData;
    try { nextData = JSON.parse(m[1]); } catch { return bad(res, 'Profile JSON parse error.', 500); }

    let { rating, wr } = extractFromNextData(nextData);
    if (rating == null) {
      const flat = JSON.stringify(nextData);
      const mm = flat.match(/"playlistId"\s*:\s*11[\s\S]*?"(?:rating|mmr)"[\s\S]*?"value"\s*:\s*(\d{3,4})/i);
      if (mm) rating = Number(mm[1]);
      const wm = flat.match(/"win(?:Percent|Percentage|Rate)"[\s\S]*?"value"\s*:\s*(\d{1,3})/i);
      if (wm) wr = Number(wm[1]);
    }
    if (rating == null) {
      const mm = html.match(/Ranked\s+Doubles\s+2v2[\s\S]*?(?:MMR|Rating)[^0-9]*(\d{3,4})/i);
      if (mm) rating = Number(mm[1]);
    }
    if (wr == null) {
      const wm = html.match(/Ranked\s+Doubles\s+2v2[\s\S]*?(?:Win\s*%|Win\s*Rate)[^0-9]*(\d{1,3})/i);
      if (wm) wr = Number(wm[1]);
    }
    if (!Number.isFinite(rating)) return bad(res, 'Could not find 2v2 rating on page.', 500);

    return ok(res, {
      platform, pid,
      currentMMR: Number(rating),
      recentWinPercent: Number.isFinite(wr) ? Number(wr) : null,
      source: 'rocketleague.tracker.network',
      fetchedAt: new Date().toISOString()
    });
  } catch (e) {
    console.error('api/profile fatal', e);
    return bad(res, 'Unexpected server error.', 500);
  }
};
