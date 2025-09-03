/* ---------------- Config ---------------- */
const BASE_WIN = 10, BASE_LOSS = 10;
const RANKS_URL = "/ranks/2v2.json"; // served by vercel rewrite

/* ---------------- State ---------------- */
let RANKS = null; // nested { rank: {div: {min,max}} }
let LAST_STATE = null;

/* ---------------- DOM ---------------- */
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

// AI CTA
document.getElementById("aiBtn").addEventListener("click", () => {
  showTooltip(
    `Ask real questions and we’ll factor them into the prediction.<br>
     <em>Example:</em> “New monitor but I’ve got a headache — can I hold D2?”<br>
     <strong>3 free</strong> Qs · Premium unlock after.`
  );
});

/* ---------------- Init ---------------- */
(async function init(){
  try{
    const res = await fetch(RANKS_URL);
    if(!res.ok) throw new Error("Failed to load rank table");
    RANKS = await res.json();
    populateRankSelect();
  }catch(e){
    console.error(e);
    rankSel.innerHTML = `<option>Error loading ranks</option>`;
  }
})();

/* ---------------- UI population ---------------- */
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
  divs.forEach(d=>{
    const opt = document.createElement("option");
    opt.value = d; opt.textContent = d;
    divSel.appendChild(opt);
  });
  divSel.disabled = divs.length === 1; // SSL etc.
}
rankSel.addEventListener("change", updateDivSelect);

/* ---------------- Helpers ---------------- */
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
  // if not inside, find neighbors
  const flat = flattenRanks();
  let lower = null, upper = null;
  for(let i=0;i<flat.length;i++){
    if(m < flat[i].min){ upper = flat[i]; lower = flat[i-1] || null; break; }
  }
  if(!upper) lower = flat.at(-1); // above all bands
  return {kind:"between", lower, upper, mmr:m};
}

function labelRank(b){ return `${b.rank} ${b.rank==='Supersonic Legend'?'':roman(b.div)} (${b.min}–${b.max})`; }

/* ---------------- Simulation ---------------- */
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

/* ---------------- Chart ---------------- */
function injectGlowFilter(){
  // add a soft glow for the line without needing CSS changes
  if(svg.__glowAdded) return;
  const defs = document.createElementNS("http://www.w3.org/2000/svg","defs");
  const filter = document.createElementNS("http://www.w3.org/2000/svg","filter");
  filter.setAttribute("id","mmrGlow");
  filter.setAttribute("x","-50%"); filter.setAttribute("y","-50%");
  filter.setAttribute("width","200%"); filter.setAttribute("height","200%");
  const gaus = document.createElementNS("http://www.w3.org/2000/svg","feGaussianBlur");
  gaus.setAttribute("stdDeviation","3");
  gaus.setAttribute("result","blur");
  const merge = document.createElementNS("http://www.w3.org/2000/svg","feMerge");
  const m1 = document.createElementNS("http://www.w3.org/2000/svg","feMergeNode"); m1.setAttribute("in","blur");
  const m2 = document.createElementNS("http://www.w3.org/2000/svg","feMergeNode"); m2.setAttribute("in","SourceGraphic");
  merge.appendChild(m1); merge.appendChild(m2);
  filter.appendChild(gaus); filter.appendChild(merge);
  defs.appendChild(filter);
  svg.appendChild(defs);
  svg.__glowAdded = true;
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
  path.setAttribute("class","path");
  path.setAttribute("filter","url(#mmrGlow)");
  svg.appendChild(path);

  // markers
  const m0 = document.createElementNS("http://www.w3.org/2000/svg","circle");
  m0.setAttribute("cx", xScale(0)); m0.setAttribute("cy", yScale(series[0]));
  m0.setAttribute("r", 6); m0.setAttribute("class","currMark");
  svg.appendChild(m0);

  const m1 = document.createElementNS("http://www.w3.org/2000/svg","circle");
  m1.setAttribute("cx", xScale(series.length-1)); m1.setAttribute("cy", yScale(series.at(-1)));
  m1.setAttribute("r", 7); m1.setAttribute("class","projMark");
  svg.appendChild(m1);

  x0.textContent = 0;
  xMid.textContent = Math.floor((series.length-1)/2);
  xMax.textContent = series.length-1;
}

/* ---------------- Ladder + Tooltip ---------------- */
function updateLadder(currentBucket, startMMR, projected, projectedBucket, finalMMR){
  tileCurrName.textContent = `${currentBucket.rank} ${currentBucket.rank==='Supersonic Legend'?'':roman(currentBucket.div)}`;
  tileCurrRange.textContent = `${currentBucket.min}–${currentBucket.max} (mmr ${startMMR})`;

  tileProjName.textContent = projected;
  tileProjRange.textContent = projectedBucket
    ? `${projectedBucket.min}–${projectedBucket.max} (mmr ${finalMMR})`
    : `mmr ${finalMMR}`;

  const delta = finalMMR - startMMR;
  mmrDelta.textContent = `${delta>=0?'+':''}${delta}`;
  tileProjected.classList.remove('up','down');
  ladderArrow.classList.remove('up','down');
  if(delta > 0){ tileProjected.classList.add('up'); ladderArrow.classList.add('up'); }
  else if(delta < 0){ tileProjected.classList.add('down'); ladderArrow.classList.add('down'); }

  // quick highlight flash on update (no CSS file changes)
  tileProjected.style.outline = "2px solid rgba(106,167,255,.45)";
  tileProjected.style.outlineOffset = "2px";
  setTimeout(()=>{ tileProjected.style.outline = "none"; }, 450);
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
      showTooltip(`You’re below the first tracked band at <strong>${mmr}</strong>. Warm up and send it.`);
    }
  }
});

/* ---------------- Predict ---------------- */
btnPredict.addEventListener("click", ()=>{
  if(!RANKS) return;

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

  // current badge
  const currState = bucketFromMMR(startMMR);
  const currB = currState.kind==='inside' ? currState.bucket : (currState.lower || currState.upper);
  currRank.textContent = labelRank(currB);
  currMMR.textContent  = startMMR;
  currWR.textContent   = (isNaN(winPct)?50:winPct).toFixed(0);

  // projected badge
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
  projMMR.textContent  = finalMMR;
  projWR.textContent   = wrSeries.at(-1).toFixed(0);

  updateLadder(currB, startMMR, projLabel, projBucket, finalMMR);
  drawSeries(mmrSeries);

  title.textContent = name ? `${name} — 2v2 Doubles` : `2v2 Doubles`;
  out.classList.remove("hide");
});

/* ---------------- UX niceties ---------------- */
elReg.addEventListener("input", ()=>{
  const v = Number(elReg.value);
  elRegTag.textContent = `${v}% • ${v>=60?"harsh":v>=30?"medium":"gentle"}`;
});