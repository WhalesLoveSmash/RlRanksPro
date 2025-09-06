// sitefrontend/ai-overlay.js
// Turns the overlay into a working Ask AI, using your /api/ai backend.
// Uses Monetize.scoreContext() (with weights loaded from /sitefrontend/monetize/weights.json)
// and Monetize.entitlements for the 3-free gating.

(function () {
  const OVERLAY_ID = "ai-overlay";
  const MODEL = "gpt-4o-mini";

  let weights = null;

  function q(sel, root = document) { return root.querySelector(sel); }

  function renderOverlayUI() {
    const card = q(`#${OVERLAY_ID} .ai-card`);
    if (!card) return;

    card.innerHTML = `
      <h3>Ask AI</h3>
      <p id="aiFree" style="opacity:.9;margin:6px 0 12px"></p>

      <div class="grid" style="margin-top:2px">
        <label class="full">
          Your question
          <textarea id="aiPrompt" rows="3" placeholder="e.g., 3 hours sleep, 70ms ping — can I keep D2?"></textarea>
        </label>

        <label>
          Sleep hours
          <input id="ctxSleep" type="number" min="0" max="12" placeholder="optional" inputmode="decimal" />
        </label>

        <label>
          Ping (ms)
          <input id="ctxPing" type="number" min="0" max="400" placeholder="optional" inputmode="numeric" />
        </label>

        <label>
          Headache
          <select id="ctxHeadache">
            <option value="">none</option>
            <option value="mild">mild</option>
            <option value="bad">bad</option>
          </select>
        </label>

        <label>
          Energy drink
          <select id="ctxEnergy">
            <option value="">no</option>
            <option value="1">yes</option>
          </select>
        </label>
      </div>

      <div class="ai-actions">
        <button id="aiSend" class="ai-primary">Ask</button>
        <a href="#" class="ai-ghost" aria-label="Close">Close</a>
      </div>

      <div id="aiStatus" class="status hide" style="margin-top:10px"></div>
      <div id="aiOut" class="card" style="margin-top:12px; display:none"></div>
    `;

    // Minimal styling for the textarea to match inputs
    const style = document.createElement("style");
    style.textContent = `
      #${OVERLAY_ID} textarea{
        background:#0d1a2b; border:1px solid var(--line); border-radius:12px;
        color:var(--ink); padding:12px; resize:vertical; min-height:84px;
        font:inherit;
      }
    `;
    card.appendChild(style);

    q("#aiSend", card).addEventListener("click", onAsk);
    updateFreeBadge();
  }

  function updateFreeBadge() {
    const p = q("#aiFree");
    if (!p || !window.Monetize) return;
    const ent = window.Monetize.entitlements;
    p.textContent = ent.premium ? "Premium active." : `Free questions left: ${ent.freeRemaining}`;
  }

  async function loadWeights() {
    if (weights) return weights;
    try {
      const res = await fetch("/sitefrontend/monetize/weights.json", { cache: "no-cache" });
      if (res.ok) weights = await res.json();
    } catch {}
    return weights;
  }

  function showStatus(text, ok = true) {
    const box = q("#aiStatus");
    if (!box) return;
    box.classList.remove("hide", "ok", "warn");
    box.classList.add("status", ok ? "ok" : "warn");
    box.textContent = text;
  }
  function hideStatus(){ const box = q("#aiStatus"); if (box) box.classList.add("hide"); }

  async function onAsk() {
    try {
      const btn = q("#aiSend");
      const out = q("#aiOut");
      const prompt = (q("#aiPrompt").value || "").trim();
      if (!prompt) { showStatus("Type a question first.", false); return; }
      hideStatus();

      // Gate: freebies/premium
      const ent = window.Monetize?.entitlements;
      if (!ent?.consumeOne()) {
        showStatus("You used your 3 free questions. Premium unlock coming soon.", false);
        return;
      }
      updateFreeBadge();

      btn.disabled = true; const prev = btn.textContent; btn.textContent = "Thinking…";

      // Build context from fields
      const ctx = {};
      const sleep = parseFloat(q("#ctxSleep").value);
      if (!Number.isNaN(sleep)) ctx.sleep_hours = sleep;

      const ping = parseFloat(q("#ctxPing").value);
      if (!Number.isNaN(ping)) ctx.ping_ms = ping;

      const h = q("#ctxHeadache").value;
      if (h === "mild") ctx.headache_mild = 1;
      if (h === "bad") ctx.headache_bad = 1;

      if (q("#ctxEnergy").value) ctx.energy_drink_recent = 1;

      // Compute heuristic MMR delta with local weights (no rewrite needed)
      let mmrDelta = 0;
      try {
        const w = await loadWeights();
        if (w && window.Monetize?.scoreContext) {
          mmrDelta = await window.Monetize.scoreContext(ctx, w);
        }
      } catch {}

      // Compose messages and call your backend
      const system =
        "Concise, practical Rocket League 2v2 rank coaching. Use the provided heuristic only as a hint. No emojis.";
      const user = [
        `Context: ${JSON.stringify(ctx)}`,
        `Heuristic MMR delta: ${mmrDelta}`,
        `User: ${prompt}`
      ].join("\n");

      const resp = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          meta: { mmrDelta }
        })
      });

      const text = await resp.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { error: "bad_json", details: text }; }

      out.style.display = "block";
      if (resp.ok && data?.text) {
        out.textContent = data.text;
      } else {
        out.textContent = `Error: ${data?.error || resp.status} — ${data?.details || "See logs."}`;
        showStatus("AI call failed.", false);
      }

      btn.disabled = false; btn.textContent = prev;
    } catch (err) {
      showStatus(String(err), false);
      const btn = q("#aiSend"); if (btn) { btn.disabled = false; btn.textContent = "Ask"; }
    }
  }

  function init() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    renderOverlayUI();
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
