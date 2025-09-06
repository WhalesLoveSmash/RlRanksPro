// File: api/ai.js
// Vercel Serverless Function (Node runtime) — always returns JSON.

// Force Node runtime for this function
async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.setHeader("Content-Type", "application/json");
    return res.status(405).send(JSON.stringify({ error: "Method Not Allowed" }));
  }

  try {
    const raw = await new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
    const body = raw ? JSON.parse(raw) : {};
    const { model = "gpt-4o-mini", messages = [], meta = {} } = body;

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      res.setHeader("Content-Type", "application/json");
      return res.status(500).send(JSON.stringify({ error: "Missing OPENAI_API_KEY" }));
    }

    // Keep payload sane
    const trimmed = messages.slice(-12).map((m) => ({
      role: m?.role || "user",
      content: String(m?.content ?? "").slice(0, 6000),
    }));

    const apiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "Concise, practical Rocket League 2v2 rank coaching. Use the client heuristic only as a hint. No emojis.",
          },
          ...trimmed,
          ...(Object.keys(meta || {}).length
            ? [{ role: "system", content: `Heuristic: ${JSON.stringify(meta).slice(0, 800)}` }]
            : []),
        ],
        temperature: 0.3,
        top_p: 1,
      }),
    });

    const text = await apiResp.text();
    res.setHeader("Content-Type", "application/json");

    if (!apiResp.ok) {
      return res
        .status(apiResp.status)
        .send(JSON.stringify({ error: "openai_error", details: text }));
    }

    const data = JSON.parse(text);
    const answer = data?.choices?.[0]?.message?.content?.trim() || "";
    return res.status(200).send(JSON.stringify({ text: answer }));
  } catch (e) {
    res.setHeader("Content-Type", "application/json");
    return res.status(500).send(JSON.stringify({ error: "server_error", details: String(e) }));
  }
}

module.exports = handler;
module.exports.config = { runtime: "nodejs" };
