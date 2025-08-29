// Robust serverless scrape for RLTracker/TrackerGG with fallback & browsery headers.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchPage(url) {
  const r = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      // these extra headers help get past some WAF rules
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Pragma": "no-cache",
      "Cache-Control": "no-cache",
      "Referer": "https://tracker.gg/rocket-league/"
    }
  });
  const html = await r.text();
  return { status: r.status, html };
}

function extractNext(html) {
  let m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  m = html.match(/window\.__NEXT_DATA__\s*=\s*({[\s\S]*?});/i);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  return null;
}

function pick2v2FromNext(nextData) {
  try {
    const txt = JSON.stringify(nextData);
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

function pick2v2FromHtml(html) {
  const m = html.match(/Ranked\s*Doubles\s*2v2([\s\S]{0,800})/i);
  if (!m) return { mmr2v2: null, recentWinPct: null };
  const block = m[1];
  const mmrMatch = block.match(/(\d{3,5}(?:,\d{3})?)/);
  const wrMatch = block.match(/(\d{1,3}(?:\.\d+)?)\s*%[^%]{0,40}(?:Win|WR|Win\s*Rate)/i);
  return {
    mmr2v2: mmrMatch ? Number(mmrMatch[1].replace(/,/g, "")) : null,
    recentWinPct: wrMatch ? Number(wrMatch[1]) : null
  };
}

module.exports = async (req, res) => {
  try {
    const { platform, pid } = req.query || {};
    if (!platform || !pid) {
      return res.status(400).json({ error: "Missing platform or pid" });
    }

    // try both RLTracker and the TrackerGG canonical host
    const targets = [
      `https://rocketleague.tracker.network/rocket-league/profile/${encodeURIComponent(platform)}/${encodeURIComponent(pid)}/overview`,
      `https://tracker.gg/rocket-league/profile/${encodeURIComponent(platform)}/${encodeURIComponent(pid)}/overview`
    ];

    let lastStatus = 0, html = null, hitUrl = null;
    for (const url of targets) {
      const r = await fetchPage(url);
      lastStatus = r.status;
      if (r.status === 200) { html = r.html; hitUrl = url; break; }
      // retry next target on common WAF responses
      if ([403, 404, 503].includes(r.status)) continue;
    }

    if (!html) {
      return res.status(lastStatus || 502).json({
        error: "Upstream not OK",
        status: lastStatus || 502,
        tried: targets
      });
    }

    const nextData = extractNext(html);
    let mmr2v2 = null, recentWinPct = null;

    if (nextData) {
      const picked = pick2v2FromNext(nextData);
      mmr2v2 = picked.mmr2v2;
      recentWinPct = picked.recentWinPct;
    }
    if (!mmr2v2) {
      const picked = pick2v2FromHtml(html);
      mmr2v2 = picked.mmr2v2 ?? mmr2v2;
      recentWinPct = picked.recentWinPct ?? recentWinPct;
    }

    if (!mmr2v2) {
      return res.status(502).json({
        error: "Could not parse 2v2 MMR from page",
        hint: nextData ? "__NEXT_DATA__ present but no 2v2 values" : "No __NEXT_DATA__ in HTML",
        url: hitUrl
      });
    }

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
    res.json({
      platform,
      pid: decodeURIComponent(pid),
      currentMMR: mmr2v2,
      recentWinPercent: recentWinPct ?? null,
      source: hitUrl.includes("tracker.gg") ? "tracker.gg" : "rocketleague.tracker.network",
      fetchedAt: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: "Scrape failed", detail: String(e) });
  }
};