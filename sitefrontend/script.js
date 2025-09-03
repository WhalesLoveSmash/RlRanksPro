/* ---------------------------------- Config ---------------------------------- */
const BASE_WIN = 10, BASE_LOSS = 10;
const RANKS_URL = "/ranks/2v2.json"; // served by vercel rewrite

/* ---------------------------------- State ----------------------------------- */
let RANKS = null;          // { rank: { div: {min,max} } }
let LAST_STATE = null;     // for Explain tooltip
let cometRAF = null;       // chart comet anim
let gradTimer = null;      // gradient shimmer timer

/* ----------------------------------- DOM ------------------------------------ */
const rankSel = document.getElementById("rank");
const divSel = document.getElementById("div");
const elGames = document.getElementById("games");
const elWin = document.getElementById("win");
const elReg = document.getElementById("regress");
const elRegTag = document.getElementById("regressTag");
const elMMROverride = document.getElementById("mmrOverride");
const elName = document.getElementById("name");
const btnPredict = document.getElementById("btnPredict");

const out = document.getElementById("out");
const title = document.getElementById("title");
const currRank = document.getElementById("currRank");
const projRank = document.getElementById("projRank");
const currMMR = document.getElementById("currMMR");
const projMMR = document.getElementById("projMMR");
const currWR = document.getElementById("currWR");
const projWR = document.getElementById("projWR");

const svg = document.getElementById("svg");
const x0 = document.getElementById("x0");
const xMid = document.getElementById("xMid");
const xMax = document.getElementById("xMax");

const explainBtn = document.getElementById("explain");
const tooltip = document.getElementById("tooltip");

// Ladder
const tileCurrName = document.getElementById("tileCurrName");
const tileCurrRange = document.getElementById("tileCurrRange");
const tileProjName = document.getElementById("tileProjName");
const tileProjRange = document.getElementById("tileProjRange");
const tileProjected = document.getElementById("tileProjected");
const ladderArrow = document.getElementById("ladderArrow");
const mmrDelta = document.getElementById("mmrDelta");

// AI
const aiBtn = document.getElementById("aiBtn");

/* ------------------------------- Init & Styles ------------------------------ */
injectDynamicStyles(); // stronger AI glow + a few micro animations

(async function init(){
  try{
    const res = await fetch(RANKS_URL);
    if(!res.ok) throw new Error("Failed to load ranks");
    RANKS = await res.json();
    populateRankSelect();
    armAIButton();
  }catch(err){
    console.error(err);
    rankSel.innerHTML = `<option>Error loading ranks</option>`;
  }
})();

/* ------------------------------ Rank population ----------------------------- */
function populateRankSelect(){
  rankSel.innerHTML = "";
  Object.keys(RANKS).forEach(r=>{
    const opt = document.createElement("option");
    opt.value = r; opt.textContent = r;
    rankSel.appendChild(opt);
  });
  rankSel.disabled = false;
  updateDivSelect();
}
function updateDivSelect(){
  divSel.innerHTML = "";
  const rank = rankSel.value;
  const divs = Object.keys(RANKS[rank]).sort((a,b)=>Number(a)-Number(b));
  for (const d of divs){
    const opt = document.createElement("option");
    opt.value = d; opt.textContent = d;
    divSel.appendChild(opt);
  }
  divSel.disabled = divs.length === 1; // SSL etc.
}
rankSel.addEventListener("change", updateDivSelect);

/* --------------------------------- Helpers ---------------------------------- */
function roman(n){ return ["I","II","III","IV"][n-1] || ""; }
function midpoint({min,max}){ return Math.round((min+max)/2); }

function flattenRanks(){
  const flat = [];
  for(const [rank,divs] of Object.entries(RANKS)){
    for(const [d,range] of Object.entries(divs)){
      flat.push({rank,div:Number(d),...range});
    }
  }
  flat.sort((a,b)=>a.min-b.min);
  return flat;
}

function bucketFromMMR(m){
  for(const [rank,divs] of Object.entries(RANKS)){
    for(const [d,range] of Object.entries(divs)){
      if(m >= range.min && m <= range.max){
        return {kind:"inside", bucket:{rank,div:Number(d),...range}};
      }
    }
  }
  const flat = flattenRanks();
  let lower = null, upper = null;
  for(let i=0;i<flat.length;i++){
    if(m < flat[i].min){ upper = flat[i]; lower = flat[i-1] || null; break; }
  }
  if(!upper) lower = flat.at(-1); // above all bands
  return {kind:"between", lower, upper, mmr:m};
}

function labelRank(b){ return `${b.rank} ${b.rank==='Supersonic Legend'?'':roman(b.div)} (${b.min}–${b.max})`; }

/* -------------------------------- Simulation -------------------------------- */
function simulateSeries(start, winPct, games, regressPercent){
  let mmr = start;
  let wr = isNaN(winPct) ? 0.5 : Math.max(0, Math.min(1, winPct/100));
  const mmrSeries = [Math.round(mmr)];
  const wrSeries  = [+(wr*100).toFixed(1)];
  const DECAY = Math.min(0.98, Math.max(0.0, regressPercent/100));

  for(let i=0;i<games;i++){
    const diff = wr - 0.5;
    wr = 0.5 + diff*(1-DECAY);
    mmr += wr*BASE_WIN - (1-wr)*BASE_LOSS;
    mmrSeries.push(Math.round(mmr));
    wrSeries.push(+(wr*100).toFixed(1));
  }
  return { mmrSeries, wrSeries };
}

/* --------------------------------- Chart ------------------------------------ */
function injectGlowFilter(){
  if(svg.__glowAdded) return;
  const defs = document.createElementNS("http://www.w3.org/2000/svg","defs");

  // Animated gradient
  const grad = document.createElementNS("http://www.w3.org/2000/svg","linearGradient");
  grad.setAttribute("id","mmrGrad");
  grad.setAttribute("x1","0%"); grad.setAttribute("x2","100%");
  grad.setAttribute("y1","0%"); grad.setAttribute("y2","0%");
  const s1 = document.createElementNS("http://www.w3.org/2000/svg","stop"); s1.setAttribute("offset","0%");   s1.setAttribute("stop-color","#6bd38a"); s1.setAttribute("stop-opacity","0.75");
  const s2 = document.createElementNS("http://www.w3.org/2000/svg","stop"); s2.setAttribute("offset","60%");  s2.setAttribute("stop-color","#6bd38a"); s2.setAttribute("stop-opacity","1");
  const s3 = document.createElementNS("http://www.w3.org/2000/svg","stop"); s3.setAttribute("offset","100%"); s3.setAttribute("stop-color","#6aa7ff"); s3.setAttribute("stop-opacity","0.85");
  grad.append(s1,s2,s3);

  // Soft glow
  const filt = document.createElementNS("http://www.w3.org/2000/svg","filter");
  filt.setAttribute("id","mmrGlow");
  filt.setAttribute("x","-50%"); filt.setAttribute("y","-50%"); filt.setAttribute("width","200%"); filt.setAttribute("height","200%");
  const blur = document.createElementNS("http://www.w3.org/2000/svg","feGaussianBlur"); blur.setAttribute("stdDeviation","2.6"); blur.setAttribute("result","b");
  const merge = document.createElementNS("http://www.w3.org/2000/svg","feMerge");
  const mn1 = document.createElementNS("http://www.w3.org/2000/svg","feMergeNode"); mn1.setAttribute("in","b");
  const mn2 = document.createElementNS("http://www.w3.org/2000/svg","feMergeNode"); mn2.setAttribute("in","SourceGraphic");
  merge.append(mn1,mn2); filt.append(blur,merge);

  defs.append(grad,filt);
  svg.appendChild(defs);
  svg.__glowAdded = true;

  // shimmer loop
  clearInterval(gradTimer);
  let pos = 0, dir = 1;
  gradTimer = setInterval(()=>{
    pos += 0.7*dir;
    if(pos>18 || pos<-18) dir*=-1;
    s2.setAttribute("offset", `${60+pos}%`);
    s3.setAttribute("offset", `${100+pos}%`);
  }, 60);
}

function drawSeries(series){
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  injectGlowFilter();

  const W=800,H=320,P=28;
  const gx0=P,gx1=W-P,gy0=P,gy1=H-P;

  const minY = Math.min(...series);
  const maxY = Math.max(...series);
  const span = Math.max(6, maxY-minY);
  const pad  = Math.ceil(span * 0.10) || 3;
  const yMin = minY - pad;
  const yMax = maxY + pad;

  const xScale = i => gx0 + (i/(series.length-1))*(gx1-gx0);
  const yScale = v => gy1 - ((v - yMin)/(yMax - yMin))*(gy1-gy0);

  // grid
  for(let i=0;i<=4;i++){
    const y = gy0 + (i/4)*(gy1-gy0);
    const line = document.createElementNS("http://www.w3.org/2000/svg","line");
    line.setAttribute("x1",gx0); line.setAttribute("y1",y);
    line.setAttribute("x2",gx1); line.setAttribute("y2",y);
    line.setAttribute("class","gridline");
    svg.appendChild(line);
  }

  // main path
  const d = series.map((v,i)=> `${i?'L':'M'} ${xScale(i)} ${yScale(v)}`).join(' ');
  const path = document.createElementNS("http://www.w3.org/2000/svg","path");
  path.setAttribute("d", d);
  path.setAttribute("fill","none");
  path.setAttribute("stroke","url(#mmrGrad)");
  path.setAttribute("stroke-width","4.5");
  path.setAttribute("filter","url(#mmrGlow)");
  svg.appendChild(path);

  // animated draw
  const len = path.getTotalLength();
  path.style.strokeDasharray = `${len}`;
  path.style.strokeDashoffset = `${len}`;
  requestAnimationFrame(()=>{
    path.style.transition = "stroke-dashoffset 900ms ease, stroke-width 600ms ease";
    path.style.strokeDashoffset = "0";
    path.style.strokeWidth = "5.5";
  });

  // markers
  const m0 = document.createElementNS("http://www.w3.org/2000/svg","circle");
  m0.setAttribute("cx", xScale(0)); m0.setAttribute("cy", yScale(series[0]));
  m0.setAttribute("r", 6); m0.setAttribute("class","currMark");
  svg.appendChild(m0);

  const m1 = document.createElementNS("http://www.w3.org/2000/svg","circle");
  m1.setAttribute("cx", xScale(series.length-1)); m1.setAttribute("cy", yScale(series.at(-1)));
  m1.setAttribute("r", 7); m1.setAttribute("class","projMark");
  svg.appendChild(m1);

  // comet
  addComet(path);

  x0.textContent = 0;
  xMid.textContent = Math.floor((series.length-1)/2);
  xMax.textContent = series.length-1;
}

function addComet(path){
  if(cometRAF) cancelAnimationFrame(cometRAF);
  const comet = document.createElementNS("http://www.w3.org/2000/svg","circle");
  comet.setAttribute("r","5");
  comet.setAttribute("fill","#6aa7ff");
  comet.setAttribute("opacity","0.9");
  comet.setAttribute("filter","url(#mmrGlow)");
  svg.appendChild(comet);

  const total = path.getTotalLength();
  let t = 0;
  const start = total*0.4;

  const loop = () => {
    t += 0.012;
    const l = start + ((Math.sin(t)+1)/2) * (total - start);
    const pt = path.getPointAtLength(l);
    comet.setAttribute("cx", pt.x);
    comet.setAttribute("cy", pt.y);
    cometRAF = requestAnimationFrame(loop);
  };
  loop();
}

/* ---------------------------- Ladder & Tooltip ------------------------------- */
function updateLadder(currentBucket, startMMR, projLabel, projBucket, finalMMR){
  tileCurrName.textContent = `${currentBucket.rank} ${currentBucket.rank==='Supersonic Legend'?'':roman(currentBucket.div)}`;
  tileCurrRange.textContent = `${currentBucket.min}–${currentBucket.max} (mmr ${startMMR})`;

  tileProjName.textContent = projLabel;
  tileProjRange.textContent = projBucket
    ? `${projBucket.min}–${projBucket.max} (mmr ${finalMMR})`
    : `mmr ${finalMMR}`;

  const delta = finalMMR - startMMR;
  mmrDeltaAnimate(delta);

  tileProjected.classList.remove('up','down');
  ladderArrow.classList.remove('up','down');
  if(delta > 0){ tileProjected.classList.add('up'); ladderArrow.classList.add('up'); }
  else if(delta < 0){ tileProjected.classList.add('down'); ladderArrow.classList.add('down'); }

  // quick flash
  flashBox(tileProjected);
}

function showTooltip(html){
  tooltip.innerHTML = html;
  tooltip.classList.remove("hide");
  clearTimeout(showTooltip._t);
  showTooltip._t = setTimeout(()=> tooltip.classList.add("hide"), 6000);
}

explainBtn.addEventListener("click", ()=>{
  if(!LAST_STATE) return;
  if(LAST_STATE.kind === "inside"){
    const b = LAST_STATE.bucket;
    showTooltip(`You’re within <strong>${b.rank} ${b.rank==='Supersonic Legend'?'':roman(b.div)}</strong> (<strong>${b.min}–${b.max}</strong>). Keep winning to climb.`);
  }else{
    const {lower,upper,mmr} = LAST_STATE;
    if(lower && upper){
      showTooltip(`You’re between <strong>${lower.rank} ${roman(lower.div)}</strong> (${lower.min}–${lower.max}) and <strong>${upper.rank} ${roman(upper.div)}</strong> (${upper.min}–${upper.max}). Current MMR: <strong>${mmr}</strong>. One hot streak tips it.`);
    }else if(!upper){
      showTooltip(`You’re above the tracked bands at <strong>${mmr}</strong>. 🚀`);
    }else{
      showTooltip(`You’re below the first tracked band at <strong>${mmr}</strong>. Reset, warm up, and climb.`);
    }
  }
});

/* -------------------------------- Predict ----------------------------------- */
btnPredict.addEventListener("click", ()=>{
  if(!RANKS) return;

  const restore = btnPredict.textContent;
  btnPredict.disabled = true; btnPredict.textContent = "Predicting…";

  const r = rankSel.value;
  const d = divSel.value;
  const band = RANKS[r][d];

  const startMMR = elMMROverride.value ? Number(elMMROverride.value) : midpoint(band);
  const games = Number(elGames.value||50);
  const reg   = Number(elReg.value||14);
  const winPct = elWin.value ? Number(elWin.value) : NaN;
  const name = (elName.value||"").trim();

  const { mmrSeries, wrSeries } = simulateSeries(startMMR, isNaN(winPct)?50:winPct, games, reg);
  const finalMMR = mmrSeries.at(-1);

  // current
  const currState = bucketFromMMR(startMMR);
  const currB = currState.kind==='inside' ? currState.bucket : (currState.lower || currState.upper);
  currRank.textContent = labelRank(currB);
  animateCount(currMMR, startMMR, 420);
  animateCount(currWR, (isNaN(winPct)?50:winPct), 420, v=>`${v.toFixed(0)}`);

  // projected
  const state = bucketFromMMR(finalMMR);
  LAST_STATE = state;
  let projLabel, projBucket=null;
  if(state.kind==='inside'){
    projBucket = state.bucket;
    projLabel = `${projBucket.rank} ${projBucket.rank==='Supersonic Legend'?'':roman(projBucket.div)}`;
  }else{
    const {lower,upper} = state;
    const choice = !upper ? lower : !lower ? upper :
      (Math.abs(finalMMR - lower.max) <= Math.abs(upper.min - finalMMR) ? lower : upper);
    projBucket = choice || null;
    projLabel = choice ? `${choice.rank} ${choice.rank==='Supersonic Legend'?'':roman(choice.div)}` : "—";
  }
  projRank.textContent = projBucket ? labelRank(projBucket) : "—";
  animateCount(projMMR, finalMMR, 520);
  animateCount(projWR, wrSeries.at(-1), 520, v=>`${v.toFixed(0)}`);

  updateLadder(currB, startMMR, projLabel, projBucket, finalMMR);
  drawSeries(mmrSeries);

  title.textContent = name ? `${name} — 2v2 Doubles` : `2v2 Doubles`;
  out.classList.remove("hide");

  // smooth center on results (mobile + desktop)
  setTimeout(()=> centerOn(out), 120);

  btnPredict.disabled = false; btnPredict.textContent = restore;
});

/* ---------------------------- Micro-interactions ---------------------------- */
elReg.addEventListener("input", ()=>{
  const v = Number(elReg.value);
  elRegTag.textContent = `${v}% • ${v>=60?"harsh":v>=30?"medium":"gentle"}`;
});

/* ------------------------------- Anim helpers ------------------------------- */
function animateCount(node, to, dur=500, fmt=(v)=>`${Math.round(v)}`){
  const from = parseFloat((node.textContent||"0").replace(/[^\d.-]/g,"")) || 0;
  const start = performance.now();
  function tick(now){
    const t = Math.min(1, (now-start)/dur);
    const v = from + (to-from)*easeOutCubic(t);
    node.textContent = fmt(v);
    if(t<1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

function flashBox(el){
  el.style.outline = "2px solid rgba(106,167,255,.45)";
  el.style.outlineOffset = "2px";
  el.style.transform = "translateZ(0) scale(1.015)";
  setTimeout(()=>{ el.style.outline="none"; el.style.transform="scale(1)"; }, 420);
}

function mmrDeltaAnimate(delta){
  const sign = delta>=0 ? "+" : "";
  mmrDelta.textContent = `${sign}${delta}`;
  mmrDelta.style.color = delta>=0 ? "var(--good)" : "var(--warn)";
}

/* ------------------------------ Scroll helper ------------------------------- */
function centerOn(el){
  const rect = el.getBoundingClientRect();
  const mid = rect.top + window.scrollY - (window.innerHeight/2) + (rect.height/2);
  window.scrollTo({ top: Math.max(0, mid - 16), behavior: "smooth" });
}

/* --------------------------- AI Button Enhancements ------------------------- */
function armAIButton(){
  aiBtn.addEventListener("click", ()=>{
    showTooltip(
      `Ask real questions and we’ll factor them into the prediction.<br>
       <em>Example:</em> “New monitor but I have a headache — can I keep D2?”<br>
       <strong>3 free</strong> Qs · Premium unlock after.`
    );
    // small press flash
    aiBtn.classList.add("ai-press");
    setTimeout(()=> aiBtn.classList.remove("ai-press"), 220);
  });
}

/* --------------------------- Dynamic CSS Injection -------------------------- */
function injectDynamicStyles(){
  const css = `
    /* AI button extra glow & ping */
    #aiBtn{ position:fixed; }
    #aiBtn::after{
      content:""; position:absolute; inset:0; border-radius:16px; pointer-events:none;
      box-shadow:0 0 24px rgba(106,167,255,.35), 0 0 48px rgba(106,167,255,.18);
      transition:filter .25s ease, transform .2s ease;
    }
    #aiBtn.ai-press::after{ filter:brightness(1.25); transform:scale(1.02); }
    #aiBtn::before{
      content:""; position:absolute; left:50%; top:50%; width:14px; height:14px; border-radius:999px;
      transform:translate(-50%,-50%); box-shadow:0 0 22px rgba(106,167,255,.85);
      animation:aiPing 2.6s ease-out infinite;
      background:rgba(106,167,255,.28); filter:blur(2px);
    }
    @keyframes aiPing{
      0%{ opacity:.75; transform:translate(-50%,-50%) scale(1); }
      70%{ opacity:0; transform:translate(-50%,-50%) scale(3.2); }
      100%{ opacity:0; transform:translate(-50%,-50%) scale(3.2); }
    }
  `;
  const tag = document.createElement("style");
  tag.textContent = css;
  document.head.appendChild(tag);
}