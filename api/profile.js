// Scrapes RLTracker / TrackerGG.
// 1) Plain fetch with browsery headers
// 2) Headless Chrome fallback using puppeteer-extra + stealth + @sparticuz/chromium

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchPage(url) {
  const r = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
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

// ---------- Stealth headless fallback ----------
async function headlessGrab(url) {
  const chromium = require("@sparticuz/chromium");
  const puppeteerExtra = require("puppeteer-extra");
  const StealthPlugin = require("puppeteer-extra-plugin-stealth");

  puppeteerExtra.use(StealthPlugin());

  chromium.setHeadlessMode = true;
  chromium.setGraphicsMode = false;

  const browser = await puppeteerExtra.launch({
    args: [...chromium.args, "--disable-dev-shm-usage", "--no-sandbox"],
    defaultViewport: { width: 1365, height: 768 },
    executablePath: await chromium.executablePath(),
    headless: chromium.headless
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.setJavaScriptEnabled(true);

    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      "Upgrade-Insecure-Requests": "1",
      "Pragma": "no-cache",
      "Cache-Control": "no-cache",
      "Referer": "https://tracker.gg/rocket-league/",
      // a few high-signal client hints
      "sec-ch-ua": "\"Chromium\";v=\"124\", \"Not.A/Brand\";v=\"24\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Windows\""
    });

    // soften bot signals
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US','en'] });
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
      window.chrome = { runtime: {} };
    });

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    const next = await page.evaluate(() => {
      try {
        if (window.__NEXT_DATA__) return window.__NEXT_DATA__;
        const el = document.querySelector('#__NEXT_DATA__');
        if (el) return JSON.parse(el.textContent || "{}");
      } catch (_) {}
      return null;
    });

    let html = null;
    if (!next) html = await page.content();
    return { nextData: next, html };
  } finally {
    await browser.close();
  }
}

module.exports = async (req, res) => {
  try {
    const { platform, pid } = req.query || {};
    if (!platform || !pid) return res.status(400).json({ error: "Missing platform or pid" });

    const targets = [
      `https://rocketleague.tracker.network/rocket-league/profile/${encodeURIComponent(platform)}/${encodeURIComponent(pid)}/overview`,
      `https://tracker.gg/rocket-league/profile/${encodeURIComponent(platform)}/${encodeURIComponent(pid)}/overview`
    ];

    let lastStatus = 0, html = null, hitUrl = null, nextData = null;

    // 1) Fast path — plain fetch
    for (const url of targets) {
      const r = await fetchPage(url);
      lastStatus = r.status;
      if (r.status === 200) { html = r.html; hitUrl = url; break; }
      if ([403, 404, 503].includes(r.status)) continue;
    }

    if (html) {
      nextData = extractNext(html);
      let { mmr2v2, recentWinPct } = nextData ? pick2v2FromNext(nextData) : { mmr2v2: null, recentWinPct: null };
      if (!mmr2v2) {
        const p = pick2v2FromHtml(html);
        mmr2v2 = p.mmr2v2 ?? mmr2v2;
        recentWinPct = p.recentWinPct ?? recentWinPct;
      }
      if (mmr2v2) {
        res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
        return res.json({
          platform,
          pid: decodeURIComponent(pid),
          currentMMR: mmr2v2,
          recentWinPercent: recentWinPct ?? null,
          source: hitUrl?.includes("tracker.gg") ? "tracker.gg" : "rocketleague.tracker.network",
          fetchedAt: new Date().toISOString()
        });
      }
    }

    // 2) Nuclear fallback — stealth headless
    let headless = null;
    for (const url of targets) {
      try {
        headless = await headlessGrab(url);
        hitUrl = url;
        if (headless) break;
      } catch { /* try next */ }
    }
    if (!headless) {
      // return 502 explicitly (not 403) so the UI message matches
      return res.status(502).json({ error: "Headless fetch failed", tried: targets });
    }

    nextData = headless.nextData || (headless.html ? extractNext(headless.html) : null);
    let mmr2v2 = null, recentWinPct = null;

    if (nextData) {
      const p = pick2v2FromNext(nextData);
      mmr2v2 = p.mmr2v2;
      recentWinPct = p.recentWinPct;
    }
    if (!mmr2v2 && headless.html) {
      const p = pick2v2FromHtml(headless.html);
      mmr2v2 = p.mmr2v2 ?? mmr2v2;
      recentWinPct = p.recentWinPct ?? recentWinPct;
    }

    if (!mmr2v2) {
      return res.status(502).json({ error: "Could not parse 2v2 MMR even with headless", url: hitUrl });
    }

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
    return res.json({
      platform,
      pid: decodeURIComponent(pid),
      currentMMR: mmr2v2,
      recentWinPercent: recentWinPct ?? null,
      source: hitUrl?.includes("tracker.gg") ? "tracker.gg (headless)" : "rocketleague.tracker.network (headless)",
      fetchedAt: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: "Scrape failed", detail: String(e) });
  }
};