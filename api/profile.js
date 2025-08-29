// Ultra-tolerant scraper for RLTracker/TrackerGG.
// - Direct HTTPS (no compression)
// - Fallback via r.jina.ai proxy
// - Parses __NEXT_DATA__ if present, otherwise deep-recursive scan for playlist 11
// - Text fallback for 2v2 section if JSON is missing
// Plan-friendly for Vercel Hobby (no puppeteer, no extra deps).

const https = require("https");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function httpsGet(url, headers = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 4) return reject(new Error("Too many redirects"));
    const u = new URL(url);
    const req = https.get(
      {
        hostname: u.hostname,
        path: u.pathname + (u.search || ""),
        protocol: u.protocol,
        method: "GET",
        headers: {
          "Accept-Encoding": "identity", // avoid gzip/brotli so we can parse as text
          "User-Agent": UA,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Connection: "keep-alive",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          Referer: "https://rocketleague.tracker.network/",
          ...headers,
        },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          const loc = res.headers.location;
          res.resume();
          if (!loc) return reject(new Error("Redirect without Location"));
          const next = loc.startsWith("http") ? loc : new URL(loc, url).href;
          return resolve(httpsGet(next, headers, redirects + 1));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode || 0, body });
        });
      }
    );
    req.on("error", reject);
  });
}

function fetchDirect(url) {
  return httpsGet(url);
}

function fetchViaJina(url) {
  // r.jina.ai fetches the page for us and returns HTML/text we can parse
  const proxy = "https://r.jina.ai/http/" + url.replace(/^https?:\/\//, "");
  return httpsGet(proxy, { Accept: "text/html,*/*;q=0.8" });
}

// --- Parsing helpers ---

function extractNext(html) {
  // Try Next.js application/json script
  let m = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (m) {
    try {
      return JSON.parse(m[1]);
    } catch {}
  }
  // Fallback: window.__NEXT_DATA__ assignment
  m = html.match(/window\.__NEXT_DATA__\s*=\s*({[\s\S]*?});/i);
  if (m) {
    try {
      return JSON.parse(m[1]);
    } catch {}
  }
  // Some proxies pretty-print JSON lines; try to find a big JSON blob quickly
  m = html.match(/\{[\s\S]{1000,}\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {}
  }
  return null;
}

// Deep search for playlist 11 and an MMR-like number
function deepFind2v2(obj) {
  const seen = new Set();
  const stack = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);

    // common shapes to catch
    const pid =
      cur.playlistId ?? cur.playlistID ?? cur.playlist?.id ?? cur.playlist;
    if (pid === 11 || pid === "11") {
      // Look for likely rating fields near this node
      const candidates = [
        cur.mmr?.value,
        cur.mmr,
        cur.rating?.value,
        cur.rating,
        cur.stats?.rating?.value,
        cur.stats?.mmr?.value,
        cur.stats?.rating,
      ].filter((v) => typeof v === "number");
      const first = candidates.find((n) => Number.isFinite(n));
      if (first) return { mmr2v2: Number(first) };
      // also look for any 3–5 digit number in stringified node
      const s = JSON.stringify(cur);
      const m = s.match(/(?:mmr|rating)["\s:\{,]*"?value"?\s*:\s*(\d{3,5})/i);
      if (m) return { mmr2v2: Number(m[1]) };
    }

    // push children
    for (const k in cur) {
      if (Object.prototype.hasOwnProperty.call(cur, k)) {
        stack.push(cur[k]);
      }
    }
  }
  return null;
}

// Text fallback: look around a "2v2" area and extract numbers
function pick2v2FromText(text) {
  const sect =
    text.match(/Ranked\s*Doubles\s*2v2[\s\S]{0,1200}/i) ||
    text.match(/2v2[\s\S]{0,800}/i);
  const block = sect ? sect[0] : text.slice(0, 4000);

  // Prefer a 3–5 digit number not followed by %
  const mmr = block.match(/\b(\d{3,5})\b(?!\s*%)/);
  const wr =
    block.match(/(\d{1,3}(?:\.\d+)?)\s*%[^%]{0,40}(?:Win|WR|Win\s*Rate)?/i) ||
    text.match(/(\d{1,3}(?:\.\d+)?)\s*%[^%]{0,40}(?:Win|WR|Win\s*Rate)?/i);

  return {
    mmr2v2: mmr ? Number(mmr[1]) : null,
    recentWinPct: wr ? Number(wr[1]) : null,
  };
}

async function tryUrl(url, modeLabel) {
  const r = await fetchDirect(url);
  if (r.status === 200) return { mode: `${modeLabel}:direct`, body: r.body };
  // try proxy on common WAF statuses
  if ([403, 404, 503].includes(r.status)) {
    const p = await fetchViaJina(url);
    if (p.status === 200) return { mode: `${modeLabel}:proxy`, body: p.body };
    return { mode: `${modeLabel}:blocked`, status: p.status || r.status };
  }
  return { mode: `${modeLabel}:status${r.status}`, status: r.status, body: r.body };
}

module.exports = async (req, res) => {
  try {
    const { platform, pid } = req.query || {};
    if (!platform || !pid) {
      return res.status(400).json({ error: "Missing platform or pid" });
    }

    const targets = [
      `https://rocketleague.tracker.network/rocket-league/profile/${encodeURIComponent(
        platform
      )}/${encodeURIComponent(pid)}/overview`,
      `https://tracker.gg/rocket-league/profile/${encodeURIComponent(
        platform
      )}/${encodeURIComponent(pid)}/overview`,
    ];

    for (const [i, url] of targets.entries()) {
      const which = i === 0 ? "rltracker" : "trackergg";
      const got = await tryUrl(url, which);

      if (!got.body) {
        // if we know it's blocked, keep trying others
        if (got.status && [403, 404, 503].includes(got.status)) continue;
        // otherwise skip to next target
        continue;
      }

      // 1) Try to pull __NEXT_DATA__ or any JSON blob
      const next = extractNext(got.body);
      let mmr2v2 = null;
      let recentWinPct = null;

      if (next) {
        const fromDeep = deepFind2v2(next);
        if (fromDeep && Number.isFinite(fromDeep.mmr2v2)) {
          mmr2v2 = fromDeep.mmr2v2;
        } else {
          const fallback = (function () {
            try {
              const txt = JSON.stringify(next);
              const mm =
                txt.match(
                  /"playlist(?:Id|ID)"\s*:\s*11[\s\S]{0,400}?"(?:mmr|rating)"[\s\S]{0,40}?"?value"?\s*:\s*(\d{3,5})/i
                ) ||
                txt.match(
                  /"(?:mmr|rating)"[\s\S]{0,40}"?value"?\s*:\s*(\d{3,5})[\s\S]{0,400}"playlist(?:Id|ID)"\s*:\s*11/i
                );
              const win = txt.match(
                /"win(?:Rate|Percent|sPercent)"\s*:\s*(\d{1,3}(?:\.\d+)?)/i
              );
              return {
                mmr2v2: mm ? Number(mm[1]) : null,
                recentWinPct: win ? Number(win[1]) : null,
              };
            } catch {
              return { mmr2v2: null, recentWinPct: null };
            }
          })();
          mmr2v2 = fallback.mmr2v2;
          recentWinPct = fallback.recentWinPct;
        }
      }

      // 2) If still nothing, text fallback (works with proxy output)
      if (!mmr2v2) {
        const textPick = pick2v2FromText(got.body);
        mmr2v2 = textPick.mmr2v2 ?? mmr2v2;
        recentWinPct = textPick.recentWinPct ?? recentWinPct;
      }

      if (mmr2v2) {
        res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
        return res.json({
          platform,
          pid: decodeURIComponent(pid),
          currentMMR: mmr2v2,
          recentWinPercent: recentWinPct ?? null,
          source: url,
          mode: got.mode,
          fetchedAt: new Date().toISOString(),
        });
      }
      // If parsing failed here, try the next target
    }

    // Nothing worked
    return res.status(502).json({
      error: "Upstream not OK",
      tried: targets,
    });
  } catch (e) {
    res.status(500).json({ error: "Scrape failed", detail: String(e) });
  }
};