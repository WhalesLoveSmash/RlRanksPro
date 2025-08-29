// Serverless function for Vercel: /api/profile
// Converts an RLTracker profile page into clean JSON { currentMMR, recentWinPercent }
// Works for URLs like: https://rocketleague.tracker.network/rocket-league/profile/steam/76561198170448639/overview
// You may call it either as /api/profile?platform=steam&pid=7656...  OR  /profile/steam/7656... (via vercel.json route)

module.exports = async function handler(req, res) {
  try {
    const method = (req.method || 'GET').toUpperCase();
    if (method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    let { platform, pid, url } = req.query || {};

    // Accept either a full RLTracker URL OR the platform/pid params
    if (!platform || !pid) {
      if (url && typeof url === 'string') {
        const m = url.match(/profile\/([^/]+)\/([^/]+)/i);
        if (m) {
          platform = m[1];
          pid = m[2];
        }
      }
    }

    if (!platform || !pid) {
      res.status(400).json({ error: 'Missing platform or pid. Pass platform & pid, or ?url=<rltracker profile url>.' });
      return;
    }

    const trackerUrl = `https://rocketleague.tracker.network/rocket-league/profile/${encodeURIComponent(platform)}/${encodeURIComponent(pid)}/overview`;

    // Use a real desktop UA; tracker blocks/gates default bots and some edge runtimes.
    const upstream = await fetch(trackerUrl, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9'
      }
    });

    if (!upstream.ok) {
      res.status(502).json({ error: `Upstream ${upstream.status}`, hint: 'Tracker may be rate-limiting/bot-gating. UA spoof applied.' });
      return;
    }

    const html = await upstream.text();

    // Robustly find Next.js bootstrap JSON
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match) {
      res.status(500).json({ error: 'Could not locate embedded profile JSON on page.' });
      return;
    }

    let nextJson;
    try {
      nextJson = JSON.parse(match[1]);
    } catch {
      res.status(500).json({ error: 'Profile JSON parse error.' });
      return;
    }

    // Crawl the JSON for 2v2 rating and a win% field, without relying on fragile deep paths.
    const flat = JSON.stringify(nextJson);

    // Current 2v2 rating
    // Handles "Ranked Doubles 2v2" or "2v2" wording variants
    const mmrMatch = flat.match(/"(?:playlist|modeName)"\s*:\s*"(?:Ranked Doubles 2v2|2v2)".*?"rating"\s*:\s*(\d{3,4})/);
    const currentMMR = mmrMatch ? Number(mmrMatch[1]) : null;

    // Any reasonable "winPercent" nearby; not all profiles expose a recent win% consistently
    const wrMatch = flat.match(/"winPercent"\s*:\s*(\d{1,3})/);
    const recentWinPercent = wrMatch ? Number(wrMatch[1]) : null;

    if (currentMMR == null) {
      res.status(500).json({ error: 'Could not find 2v2 rating on the page.' });
      return;
    }

    res.status(200).json({
      platform,
      pid,
      currentMMR,
      recentWinPercent,
      source: 'rocketleague.tracker.network',
      fetchedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('profile.js error', err);
    res.status(500).json({ error: 'Unexpected server error.' });
  }
};