// Vercel Serverless Function (Node 18, CommonJS)
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { model = "gpt-4o-mini", messages = [], meta = {} } = body;

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    // keep payload sane
    const trimmed = messages.slice(-12).map(m => ({
      role: m.role || "user",
      content: String(m.content || "").slice(0, 6000)
    }));

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Concise, practical Rocket League 2v2 rank coaching. Use client heuristic only as a hint. No emojis." },
          ...trimmed,
          ...(Object.keys(meta).length ? [{ role: "system", content: `Heuristic: ${JSON.stringify(meta).slice(0,800)}` }] : [])
        ],
        temperature: 0.3,
        top_p: 1
      })
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(r.status).json({ error: "openai_error", details: t });
    }

    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    return res.status(200).json({ text });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server_error", details: String(e) });
  }
};