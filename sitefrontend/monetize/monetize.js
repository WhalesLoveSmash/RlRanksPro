/* sitefrontend/monetize/monetize.js
 *
 * ⚠️ Dev convenience only:
 *  - You may test direct OpenAI calls by storing a key in localStorage:
 *      localStorage.setItem('rlranks_openai_key', 'sk-...');
 *    or by assigning window.MONETIZE_OPENAI_KEY = 'sk-...';
 *  - Do NOT ship real keys in the client in production.
 *  - For prod, set USE_PROXY = true and implement /api/ai on your host.
 */

(function () {
  const WEIGHTS_URL = '/sitefrontend/monetize/weights.json';

  // —— Toggle this ON for production once you have a backend proxy ——
  const USE_PROXY = true;             // true -> POST to /api/ai with {messages,context}
  const PROXY_ENDPOINT = '/api/ai';
  // ————————————————————————————————————————————————————————————————

  // Reasonable default for cheap/fast context-y model
  let MODEL = 'gpt-4o-mini';

  // Simple in-memory cache
  let _weights = null;

  // Freebie logic: 3 questions for free
  const Entitlements = {
    freeRemaining: 3,
    premium: false,
    consumeOne() {
      if (this.premium) return true;
      if (this.freeRemaining > 0) {
        this.freeRemaining -= 1;
        try { localStorage.setItem('rlranks_free_qs', String(this.freeRemaining)); } catch {}
        return true;
      }
      return false;
    },
    restoreFromStorage() {
      try {
        const raw = localStorage.getItem('rlranks_free_qs');
        if (raw != null) this.freeRemaining = Math.max(0, parseInt(raw, 10) || 0);
      } catch {}
    },
    grantPremium() {
      this.premium = true;
    }
  };
  Entitlements.restoreFromStorage();

  async function loadWeights(force = false) {
    if (_weights && !force) return _weights;
    const res = await fetch(WEIGHTS_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Failed to load weights.json');
    _weights = await res.json();
    return _weights;
  }

  /**
   * scoreContext(ctx, weights?)
   * ctx example:
   * {
   *   sleep_hours: 6,
   *   new_monitor_today: 1,
   *   headache_mild: 0,
   *   controller_issue: 2,
   *   ping_ms: 60,
   *   time_of_day_block: "late_night",
   *   queue_streak_state: "on_heater"
   * }
   */
  async function scoreContext(ctx = {}, weightsArg) {
    const w = weightsArg || (await loadWeights());
    const f = w.factors || {};
    let total = 0;

    const add = (mmr) => { total += mmr; };

    for (const [key, def] of Object.entries(f)) {
      const val = ctx[key];
      if (val == null && (w.defaults?.assume_missing_is_neutral ?? true)) continue;

      switch (def.unit) {
        case 'boolean': {
          const v = Number(Boolean(val));
          if (def.weight) add(def.weight * v);
          break;
        }
        case 'scale_0_3': {
          const steps = Number(val) || 0;
          add((def.weight_per_step || 0) * steps);
          break;
        }
        case 'hours': {
          const target = def.target ?? 7.5;
          const per = def.per_unit_from_target ?? -6;
          const v = Number(val);
          if (!Number.isNaN(v)) add((v - target) * per);
          break;
        }
        case 'ms_over_ideal': {
          const ideal = def.ideal_ms ?? 40;
          const over = Math.max(0, (Number(val) || 0) - ideal);
          const capped = Math.min(over, def.max_considered_ms ?? over);
          add(capped * (def.per_ms_over_ideal ?? 0));
          break;
        }
        case 'percent': {
          const pct = Math.max(0, Number(val) || 0);
          const capped = Math.min(pct, def.max_pct ?? pct);
          add(capped * (def.per_pct ?? 0));
          break;
        }
        case 'frames': {
          const frames = Math.max(0, Number(val) || 0);
          const capped = Math.min(frames, def.max_frames ?? frames);
          add(capped * (def.per_frame ?? 0));
          break;
        }
        case 'matches': {
          const m = Math.max(0, Number(val) || 0);
          const capped = Math.min(m, def.max_matches ?? m);
          add(capped * (def.per_match ?? 0));
          break;
        }
        case 'category': {
          const label = String(val || '').trim();
          const table = def.weights || {};
          if (label in table) add(Number(table[label]) || 0);
          break;
        }
        default: {
          // Unknown unit; ignore
          break;
        }
      }
    }

    // Soft-cap & hard-cap
    const soft = w.defaults?.soft_cap_start ?? 80;
    const hard = w.defaults?.cap_total_delta_mmr ?? 120;
    const abs = Math.abs(total);
    if (abs > soft) {
      const extra = abs - soft;
      const reduced = soft + extra * 0.5; // compress beyond soft threshold
      total = Math.sign(total) * Math.min(reduced, hard);
    } else {
      total = Math.sign(total) * Math.min(abs, hard);
    }

    return Math.round(total);
  }

  /**
   * askAI(prompt, context)
   * - Uses dev key from localStorage or window.MONETIZE_OPENAI_KEY
   * - In production, flip USE_PROXY=true and deploy /api/ai
   */
  async function askAI(prompt, context = {}) {
    if (!Entitlements.consumeOne()) {
      return {
        ok: false,
        error: 'limit',
        message: 'You used your 3 free questions. Premium unlock coming soon.'
      };
    }

    const weights = await loadWeights();
    const mmrDelta = await scoreContext(context, weights);

    const system = [
      "You help Rocket League 2v2 players project rank.",
      "You get human context and a rough MMR delta from heuristics.",
      "Give short, confident, practical guidance. No emojis."
    ].join(' ');

    const user = [
      `Context: ${JSON.stringify(context)}`,
      `Heuristic MMR delta: ${mmrDelta}`,
      `User: ${prompt}`
    ].join('\n');

    // Proxy path (recommended for production)
    if (USE_PROXY) {
      try {
        const res = await fetch(PROXY_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user }
            ],
            meta: { mmrDelta }
          })
        });
        if (!res.ok) {
          const t = await res.text();
          return { ok: false, error: 'proxy', message: t || 'Proxy error' };
        }
        const data = await res.json();
        return { ok: true, text: data.text || data.choices?.[0]?.message?.content || '' };
      } catch (err) {
        return { ok: false, error: 'network', message: String(err) };
      }
    }

    // Direct-to-OpenAI (DEV ONLY)
    const key =
      (typeof window !== 'undefined' && window.MONETIZE_OPENAI_KEY) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('rlranks_openai_key'));

    if (!key) {
      console.warn('[monetize] No OpenAI key found. Returning placeholder answer.');
      const fake = `Quick take: with your setup right now, expect roughly ${mmrDelta >= 0 ? '+' : ''}${mmrDelta} MMR tilt. Focus on calm comms, short warmup, and queue in your best time window.`;
      return { ok: true, text: fake, dev: true };
    }

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          temperature: 0.3,
          top_p: 1
        })
      });

      if (!res.ok) {
        const t = await res.text();
        return { ok: false, error: 'openai', message: t || 'OpenAI error' };
      }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content?.trim() || '';
      return { ok: true, text };
    } catch (err) {
      return { ok: false, error: 'network', message: String(err) };
    }
  }

  function setApiKey(key) {
    try { localStorage.setItem('rlranks_openai_key', key); } catch {}
  }
  function setModel(model) { MODEL = model || MODEL; }

  // Expose a tiny API without touching your main files
  window.Monetize = {
    loadWeights,
    scoreContext,
    askAI,
    setApiKey,
    setModel,
    entitlements: Entitlements
  };
})();
