/* sitefrontend/ai-layer.js
 * Adds a yellow AI overlay line on the chart (non-destructive)
 * and renders a nicely formatted AI advice card under the rank.
 */
(function () {
  const ADVICE_ID = "aiAdviceCard";

  // ————— utilities —————
  function mdToHtml(s="") {
    // **bold** and *em* (super light MD)
    return s
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
      .replace(/\*(.+?)\*/g,"<em>$1</em>")
      .split(/\n{2,}/).map(p=>`<p>${p}</p>`).join("");
  }
  function toast(msg) {
    const t = document.getElementById("tooltip");
    if (!t) return;
    t.innerHTML = msg;
    t.classList.remove("hide");
    clearTimeout(toast._t);
    toast._t = setTimeout(()=> t.classList.add("hide"), 3800);
  }

  // Inject a few styles for overlay/advice
  (function injectStyles(){
    const css = `
      #svg path.aiOverlay {
        vector-effect: non-scaling-stroke;
        stroke-linecap: round;
        stroke-linejoin: round;
        filter: url(#mmrGlow);
      }
      #svg circle.aiMark { fill: var(--ai,#ffd36a); r:6; opacity:.95; filter:url(#mmrGlow); }
      .status.ai {
        border-color: rgba(255,211,106,.55);
        background: linear-gradient(180deg,#121b2a,#0e1726);
        box-shadow: 0 8px 26px rgba(0,0,0,.25), inset 0 0 24px rgba(255,211,106,.06);
      }
      .ai-head { font-weight:900; letter-spacing:.2px; margin-bottom:6px; color: #ffe08a; }
      .ai-badge {
        display:inline-block; font-size:12px; margin-left:8px; padding:2px 8px;
        border-radius:999px; border:1px solid rgba(255,211,106,.35); color:#ffe08a;
      }
    `;
    const tag = document.createElement("style");
    tag.textContent = css;
    document.head.appendChild(tag);
  })();

  // Capture the base series every time your original drawSeries runs.
  let _origDraw = null;
  window.__BASE_SERIES = null; // global snapshot of the last chart data

  function wrapDrawSeries() {
    if (typeof window.drawSeries !== "function" || _origDraw) return;
    _origDraw = window.drawSeries;
    window.drawSeries = function (series) {
      window.__BASE_SERIES = Array.isArray(series) ? series.slice() : null;
      return _origDraw(series);
    };
  }

  // Build the same scales your chart uses (based on the *base* series)
  function getScales(base) {
    const W=800,H=320,P=28;
    const gx0=P,gx1=W-P,gy0=P,gy1=H-P;
    const minY = Math.min(...base);
    const maxY = Math.max(...base);
    const span = Math.max(6, maxY-minY);
    const pad  = Math.ceil(span * 0.10) || 3;
    const yMin = minY - pad;
    const yMax = maxY + pad;
    const xScale = i => gx0 + (i/(base.length-1))*(gx1-gx0);
    const yScale = v => gy1 - ((v - yMin)/(yMax - yMin))*(gy1-gy0);
    return { xScale, yScale };
  }

  // Draw the yellow AI overlay line. This never clears your existing chart.
  function drawAiOverlay(overlaySeries) {
    const svg = document.getElementById("svg");
    if (!svg) return;

    // Remove a previous overlay if present
    Array.from(svg.querySelectorAll("[data-ai-overlay]")).forEach(n=>n.remove());

    // Ensure we have a gradient for the AI line
    const defs = svg.querySelector("defs") || (function(){
      const d = document.createElementNS("http://www.w3.org/2000/svg","defs");
      svg.appendChild(d);
      return d;
    })();

    let aiGrad = defs.querySelector("#aiGrad");
    if (!aiGrad) {
      aiGrad = document.createElementNS("http://www.w3.org/2000/svg","linearGradient");
      aiGrad.setAttribute("id","aiGrad");
      aiGrad.setAttribute("x1","0%"); aiGrad.setAttribute("x2","100%");
      aiGrad.setAttribute("y1","0%"); aiGrad.setAttribute("y2","0%");
      const s1 = document.createElementNS("http://www.w3.org/2000/svg","stop"); s1.setAttribute("offset","0%");  s1.setAttribute("stop-color","#ffe289"); s1.setAttribute("stop-opacity","0.8");
      const s2 = document.createElementNS("http://www.w3.org/2000/svg","stop"); s2.setAttribute("offset","60%"); s2.setAttribute("stop-color","#ffd36a"); s2.setAttribute("stop-opacity","1");
      const s3 = document.createElementNS("http://www.w3.org/2000/svg","stop"); s3.setAttribute("offset","100%"); s3.setAttribute("stop-color","#ffbf3f"); s3.setAttribute("stop-opacity","0.9");
      aiGrad.append(s1,s2,s3);
      defs.appendChild(aiGrad);
    }

    const base = window.__BASE_SERIES || overlaySeries;
    const { xScale, yScale } = getScales(base);

    const d = overlaySeries.map((v,i)=> `${i?'L':'M'} ${xScale(i)} ${yScale(v)}`).join(" ");
    const path = document.createElementNS("http://www.w3.org/2000/svg","path");
    path.setAttribute("d", d);
    path.setAttribute("fill","none");
    path.setAttribute("stroke","url(#aiGrad)");
    path.setAttribute("stroke-width","4");
    path.setAttribute("class","aiOverlay");
    path.setAttribute("data-ai-overlay","path");
    svg.appendChild(path);

    // End marker
    const end = document.createElementNS("http://www.w3.org/2000/svg","circle");
    end.setAttribute("cx", xScale(overlaySeries.length-1));
    end.setAttribute("cy", yScale(overlaySeries.at(-1)));
    end.setAttribute("class","aiMark");
    end.setAttribute("data-ai-overlay","mark");
    svg.appendChild(end);
  }

  // Advice card under the rank tiles
  function renderAdvice(adviceHtml) {
    const out = document.getElementById("out");
    if (!out) return;
    let card = document.getElementById(ADVICE_ID);
    if (!card) {
      card = document.createElement("div");
      card.id = ADVICE_ID;
      card.className = "status ai";
      out.appendChild(card);
    }
    card.innerHTML = `
      <div class="ai-head">AI Insight <span class="ai-badge">overlay only</span></div>
      <div class="ai-body">${adviceHtml}</div>
    `;
  }

  // Public entry point: called by ai-overlay.js after an API response.
  function plotOverlay(mmrDelta, adviceText) {
    const base = window.__BASE_SERIES;
    if (!base || !Array.isArray(base) || base.length < 2) {
      toast("Run a prediction first, then Ask AI.");
      return;
    }
    // Ease from 0 → mmrDelta across the series length
    const n = base.length - 1;
    const overlay = base.map((v,i)=> Math.round(v + (mmrDelta * (i / Math.max(1,n)))));
    drawAiOverlay(overlay);

    const html = mdToHtml(adviceText || "No advice returned.");
    renderAdvice(html);

    // Close the overlay sheet (uses your #ai-overlay anchor)
    if (location.hash === "#ai-overlay") location.hash = "";
    // Center on results again
    const out = document.getElementById("out");
    if (out) {
      const rect = out.getBoundingClientRect();
      const mid = rect.top + window.scrollY - (window.innerHeight/2) + (rect.height/2);
      window.scrollTo({ top: Math.max(0, mid - 16), behavior: "smooth" });
    }
  }

  // Expose
  window.RL_AI = { plotOverlay };

  // Start after your main script is on the page
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wrapDrawSeries);
  } else {
    wrapDrawSeries();
  }
})();
