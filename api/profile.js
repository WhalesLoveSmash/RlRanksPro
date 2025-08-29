// Robust serverless scrape for RLTracker.
// Uses Node 18's global fetch (auto-decompress), follows redirects,
// tries __NEXT_DATA__ first, then falls back to plain-text 2v2 block scan.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function pick2v2FromNext(nextData) {
  try {
    const txt = JSON.stringify(nextData);
    // try playlist 11 (2v2) near "mmr"
    const mm =
      txt.match(/"playlist(?:Id|ID)"\s*:\s*11[\s\S]{0,300}?"mmr"\s*:\s*(\d{3,5})/i) ||
      txt.match(/"mmr"\s*:\s*(\d{3,5})[\s\S]{0,300}"playlist(?:Id|ID)"\s*:\s*11/i);
    const win =
      txt.match(/"win(?:Rate|Percent|sPercent)"\s*:\s*(\d{1,3}(?:\.\d+)?)/i);

    return {
      mmr2v2: mm ? Number(mm[1]) : null,
      recentWinPct: win ? Number(win[1]) : null,
    };
  } catch {
    return { mmr2v2: null, recentWinPct: null };
  }
}

function pick2v2FromHtml(html) {
  // Look for a "Ranked Doubles 2v2" block and the first 3–5 digit number after it.
  const m = html.match(/Ranked\s*Doubles\s*2v2([\s\S]{0,800})/i);
  if (!m) return { mmr2v2: null, recentWinPct: null };

  const block = m[1];
  const mmrMatch = block.match(/(\d{3,5}(?:,\d{3})?)/);
  const wrMatch =
    block.match(/(\d{1,3}(?:\.\d+)?)\s*%[^%]{0,40}(?:Win|WR|Win\s*Rate)/i);

  return {
    mmr2v2: mmrMatch ? Number(mmrMatch[1].replace(/,/g, "")) : null,
    recentWinPct: wrMatch ? Number(wrMatch[1]) : null,
  };
}

function extractNext(html) {
  const a = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (a) {
    try { return JSON.parse(a[1]); } catch {}
  }
  const b = html.match(/window\.__NEXT_DATA__\s*=\s*({[\s\S]*?});/i);
  if (b) {
    try { return JSON.parse(b[1]); } catch {}
  }
  return null;
}

module.exports = async (req, res) => {
  try {
    const { platform, pid } = req.query || {};
    if (!platform || !pid) {
      return res.status(400).json({ error: "Missing platform or pid" });
    }

    const profileUrl = `https://rocketleague.tracker.network/rocket-league/profile/${encodeURIComponent(
      platform
    )}/${encodeURIComponent(pid)}/overview`;

    const r = await fetch(profileUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    const html = await r.text();
    if (!r.ok) {
      return res.status(r.status).json({
        error: "Upstream not OK",
        status: r.status,
        url: profileUrl,
      });
    }

    // Try Next.js JSON first
    const next = extractNext(html);
    let mmr2v2 = null, recentWinPct = null;

    if (next) {
      const picked = pick2v2FromNext(next);
      mmr2v2 = picked.mmr2v2;
      recentWinPct = picked.recentWinPct;
    }

    // Fallback: visible HTML text
    if (!mmr2v2) {
      const picked = pick2v2FromHtml(html);
      mmr2v2 = picked.mmr2v2 ?? mmr2v2;
      recentWinPct = picked.recentWinPct ?? recentWinPct;
    }

    if (!mmr2v2) {
      // Helpful diagnostics back to the UI
      return res.status(502).json({
        error: "Could not parse 2v2 MMR from RLTracker page",
        hint: next ? "__NEXT_DATA__ present but no 2v2 MMR" : "No __NEXT_DATA__ in HTML",
        url: profileUrl,
      });
    }

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
    res.json({
      platform,
      pid: decodeURIComponent(pid),
      currentMMR: mmr2v2,
      recentWinPercent: recentWinPct ?? null,
      source: "rocketleague.tracker.network",
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: "Scrape failed", detail: String(e) });
  }
};