/* sitefrontend/ai-overlay.js
 * Replaces the temporary "Ask AI (Not Live Yet)" card with a real form,
 * calls Monetize.askAI(), then paints the overlay via RL_AI.plotOverlay().
 */
(function () {
  function byId(id){ return document.getElementById(id); }

  function buildUI() {
    const sheet = document.getElementById("ai-overlay");
    const card  = sheet && sheet.querySelector(".ai-card");
    if (!card) return;

    card.innerHTML = `
      <h3>Ask AI</h3>
      <p style="opacity:.85;margin:6px 0 10px">
        We’ll overlay a yellow “AI projection” on your chart and give concise advice.
      </p>

      <label style="display:grid;gap:6px;margin:10px 0 0">
        Your question
        <textarea id="ai_q" rows="3" placeholder="e.g., 3h sleep + 70ms ping — can I keep D2?" style="resize:vertical;border-radius:12px;border:1px solid var(--line);background:#0d1a2b;color:var(--ink);padding:10px"></textarea>
      </label>

      <div class="grid" style="margin-top:10px">
        <label>Sleep hours
          <input id="ctx_sleep" type="number" min="0" max="12" inputmode="decimal" placeholder="optional" />
        </label>
        <label>Ping (ms)
          <input id="ctx_ping" type="number" min="0" max="300" inputmode="numeric" placeholder="optional" />
        </label>
        <label>Headache
          <select id="ctx_headache">
            <option value="">none</option>
            <option value="mild">mild</option>
            <option value="bad">bad</option>
          </select>
        </label>
        <label>Energy drink
          <select id="ctx_energy">
            <option value="">no</option>
            <option value="yes">yes</option>
          </select>
        </label>
      </div>

      <div class="ai-actions">
        <button id="ai_ask" class="ai-primary">Ask</button>
        <a href="#" class="ai-ghost">Close</a>
      </div>

      <div id="ai_err" class="status warn hide" style="margin-top:10px"></div>
    `;

    // Events
    card.querySelector("#ai_ask").addEventListener("click", onAsk);
  }

  async function onAsk() {
    const q   = (byId("ai_q").value || "").trim() || "Given my current state, what should I focus on?";
    const ctx = {
      // Map to your weights.json keys
      sleep_hours:       byId("ctx_sleep").value ? Number(byId("ctx_sleep").value) : undefined,
      ping_ms:           byId("ctx_ping").value ? Number(byId("ctx_ping").value) : undefined,
      headache_mild:     byId("ctx_headache").value === "mild" ? 1 : 0,
      headache_bad:      byId("ctx_headache").value === "bad"  ? 1 : 0,
      energy_drink_recent: byId("ctx_energy").value === "yes" ? 1 : 0,
    };

    const err = byId("ai_err");
    err.classList.add("hide");
    err.textContent = "";

    try {
      // Local heuristic delta (same as server uses)
      const mmrDelta = await window.Monetize.scoreContext(ctx);

      // Call your proxy (or direct dev path inside Monetize.askAI)
      const res = await window.Monetize.askAI(q, ctx);
      if (!res.ok) {
        err.textContent = (res.message || "AI error") + (res.error==="limit" ? " (free Qs used)" : "");
        err.classList.remove("hide");
        return;
      }

      // Paint overlay + advice and close the sheet
      window.RL_AI.plotOverlay(mmrDelta, res.text || "No advice.");
    } catch (e) {
      err.textContent = String(e);
      err.classList.remove("hide");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildUI);
  } else {
    buildUI();
  }
})();
