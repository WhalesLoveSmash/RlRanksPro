// File: api/ai.js
// Edge Function version — always returns JSON.
export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    if (req.method && req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { "content-type": "application/json", "allow": "POST" },
      });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const { model = "gpt-4o-mini", messages = [], meta = {} } = body;

    // Keep payload sane
    const trimmed = (Array.isArray(messages) ? messages : [])
      .slice(-12)
      .map((m) => ({
        role: m?.role || "user",
        content: String(m?.content ?? "").slice(0, 6000),
      }));

    // Call OpenAI
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
              "Concise, practical Rocket League 2v2 rank coaching. " +
              "Use the client heuristic only as a hint. No emojis.",
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

    if (!apiResp.ok) {
      return new Response(JSON.stringify({ error: "openai_error", details: text }), {
        status: apiResp.status,
        headers: { "content-type": "application/json" },
      });
    }

    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    const answer = data?.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ text: answer }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "server_error", details: String(err?.stack || err) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
