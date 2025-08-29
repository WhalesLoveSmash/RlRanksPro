/* -------- settings / thresholds ---------- */

// Load rank thresholds from ranks.json (existing in your repo).
// Fallback to simple brackets if the file isn't found.
let RANKS = null;
fetch('ranks.json').then(r => r.ok ? r.json() : null).then(j => RANKS = j).catch(()=>{});

const BASE_WIN = 10, BASE_LOSS = 10;

/********** DOM **********/
const elForm   = document.getElementById("form");
const elName   = document.getElementById("name");
const elInput  = document.getElementById("trackerInput");
const elFetch  = document.getElementById("btnFetch");
const elStatus = document.getElementById("fetchStatus");
const elMMR    = document.getElementById("mmr");
const elWin    = document.getElementById("win");

const elGames  = document.getElementById("games");
const elReg    = document.getElementById("regress");
const elRegTag = document.getElementById("regressTag");
const btnPredict = document.getElementById("btnPredict");

const out      = document.getElementById("out");
const title    = document.getElementById("title");
const currRank = document.getElementById("currRank");
const projRank = document.getElementById("projRank");
const currMMR  = document.getElementById("currMMR");
const projMMR  = document.getElementById("projMMR");
const currWR   = document.getElementById("currWR");
const projWR   = document.getElementById("projWR");
const svg      = document.getElementById("svg");
const x0       = document.getElementById("x0");
const xMid     = document.getElementById("xMid");
const xMax     = document.getElementById("xMax");

/********** helpers **********/
function setStatus(msg, ok=false){
  elStatus.textContent = msg;
  elStatus.classList.remove("hide","ok","warn");
  elStatus.classList.add(ok ? "ok" : "warn","status");
}
function clearStatus(){ elStatus.classList.add("hide"); }

function buildTrackerURL(raw){
  const s = (raw||"").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://rocketleague.tracker.network/rocket-league/profile/steam/${encodeURIComponent(s)}/overview`;
}

function extractNext(html){
  let m = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  m = html.match(/window\.__NEXT_DATA__\s*=\s*({[\s\S]*?});/i);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  return null;
}

function deepFind2v2(obj){
  const seen = new Set(), stack=[obj];
  while(stack.length){
    const cur = stack.pop();
    if(!cur || typeof cur!=="object") continue;
    if(seen.has(cur)) continue;
    seen.add(cur);

    const pid = cur.playlistId ?? cur.playlistID ?? cur.playlist?.id ?? cur.playlist;
    if (pid === 11 || pid === "11"){
      const picks = [cur.mmr?.value, cur.rating?.value, cur.mmr, cur.rating]
        .filter(v => typeof v === "number");
      if (picks.length) return { mmr2v2: Number(picks[0]) };
      const s = JSON.stringify(cur);
      const m = s.match(/"(?:mmr|rating)"[\s\S]{0,40}"?value"?\s*:\s*(\d{3,5})/i);
      if (m) return { mmr2v2: Number(m[1]) };
    }
    for (const k in cur) if (Object.hasOwn(cur,k)) stack.push(cur[k]);
  }
  return null;
}

function pick2v2FromText(text){
  const sect = text.match(/Ranked\s*Doubles\s*2v2[\s\S]{0,1200}/i) || text.match(/2v2[\s\S]{0,800}/i);
  const block = sect ? sect[0] : text.slice(0, 4000);
  const mmr = block.match(/\b(\d{3,5})\b(?!\s*%)/);
  const wr  = block.match(/(\d{1,3}(?:\.\d+)?)\s*%[^%]{0,40}(?:Win|WR|Win\s*Rate)?/i) || text.match(/(\d{1,3}(?:\.\d+)?)\s*%[^%]{0,40}(?:Win|WR|Win\s*Rate)?/i);
  return { mmr2v2: mmr ? Number(mmr[1]) : null, recentWinPct: wr ? Number(wr[1]) : null };
}

async function pullFromRLTracker(url){
  const prox = "https://r.jina.ai/http/"+url.replace(/^https?:\/\//,'');
  const res  = await fetch(prox, {mode:"cors"});
  if(!res.ok) throw new Error(`Upstream not OK (${res.status})`);
  const text = await res.text();

  // 1) JSON path
  const next = extractNext(text);
  if(next){
    const d = deepFind2v2(next);
    let wr = null;
    try {
      const s = JSON.stringify(next);
      const m = s.match(/"win(?:Rate|Percent|sPercent)"\s*:\s*(\d{1,3}(?:\.\d+)?)/i);
      if (m) wr = Number(m[1]);
    } catch {}
    if (d && d.mmr2v2) return { mmr: d.mmr2v2, winPct: wr };
  }

  // 2) text fallback
  const p = pick2v2FromText(text);
  if (p.mmr2v2) return { mmr: p.mmr2v2, winPct: p.recentWinPct ?? null };
  throw new Error("Couldn't find Ranked Doubles 2v2 on the page.");
}

/* rank utils */
function bucket(m){
  if (Array.isArray(RANKS) && RANKS.length){
    for (const r of RANKS){
      if (m >= r.lo && m <= r.hi) return r;
    }
    // nearest
    const closest = [...RANKS].sort((a,b)=>Math.abs(m-a.lo)-Math.abs(m-b.lo))[0];
    return closest || { t:"Unranked", d:"—", lo:0, hi:0 };
  } else {
    // fallback coarse bands
    const bands = [
      {t:"Bronze", d:"I", lo:0, hi:399},
      {t:"Silver", d:"I", lo:400, hi:799},
      {t:"Gold", d:"I", lo:800, hi:999},
      {t:"Platinum", d:"I", lo:1000, hi:1149},
      {t:"Diamond", d:"I", lo:1150, hi:1349},
      {t:"Champion", d:"I", lo:1350, hi:1549},
      {t:"Grand Champ", d:"I", lo:1550, hi:1799},
      {t:"SSL", d:"—", lo:1800, hi:10000}
    ];
    for (const r of bands){ if (m >= r.lo && m <= r.hi) return r; }
    return bands.at(-1);
  }
}
function labelRank(b){ return `${b.t}${b.d && b.d!=="—" ? " "+b.d:""} (${b.lo}–${b.hi})`; }

/* series sim */
function simulateSeries(start, winPct, games, regressPercent){
  let mmr = start;
  let wr = Math.max(0, Math.min(1, winPct/100));
  const mmrSeries = [Math.round(mmr)];
  const wrSeries  = [+(wr*100).toFixed(1)];

  const DECAY = Math.min(0.98, Math.max(0.0, regressPercent/100)); // 0..1
  for(let i=0;i<games;i++){
    const diff = wr - 0.5;
    wr = 0.5 + diff*(1-DECAY);
    mmr += wr*BASE_WIN - (1-wr)*BASE_LOSS;
    mmrSeries.push(Math.round(mmr));
    wrSeries.push(+(wr*100).toFixed(1));
  }
  return { mmrSeries, wrSeries };
}

/* chart */
function drawSeries(series){
  while (svg.firstChild) svg.removeChild(svg.firstChild);
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

  // path
  const d = series.map((v,i)=> `${i?'L':'M'} ${xScale(i)} ${yScale(v)}`).join(' ');
  const path = document.createElementNS("http://www.w3.org/2000/svg","path");
  path.setAttribute("d", d);
  path.setAttribute("class","path");
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

/********** events **********/
elReg.addEventListener("input", ()=>{
  const v = Number(elReg.value);
  elRegTag.textContent = `${v}% • ${v>=60?"harsh":v>=30?"medium":"gentle"}`;
});

elFetch.addEventListener("click", async ()=>{
  clearStatus();
  const built = buildTrackerURL(elInput.value || "");
  if(!built){ setStatus("Enter a full RLTracker URL or a Steam name.", false); return; }
  elFetch.disabled = true; elFetch.textContent = "Fetching…";
  try{
    const { mmr, winPct } = await pullFromRLTracker(built);
    elMMR.value = String(mmr);
    if (winPct!=null) elWin.value = String(winPct);
    setStatus("Fetched Ranked 2v2 MMR and Win% successfully.", true);
  }catch(err){
    setStatus(err.message || "Fetch failed.", false);
  }finally{
    elFetch.disabled = false; elFetch.textContent = "Fetch Ranked 2v2";
  }
});

btnPredict.addEventListener("click", ()=>{
  clearStatus();
  const name   = (elName.value||"").trim();
  const mmrNow = Number(elMMR.value);
  const winPct = Number(elWin.value);
  const games  = Number(elGames.value || 25);
  const reg    = Number(elReg.value  || 30);

  if (Number.isNaN(mmrNow)) { setStatus("Missing current 2v2 MMR. Fetch or type it in backup.", false); return; }
  if (Number.isNaN(winPct)) { setStatus("Missing recent Win%. Fetch or type it in backup.", false); return; }

  const currB = bucket(mmrNow);
  currRank.textContent = labelRank(currB);
  currMMR.textContent  = mmrNow;
  currWR.textContent   = winPct.toFixed(0);

  const { mmrSeries, wrSeries } = simulateSeries(mmrNow, winPct, games, reg);
  const finalMMR = mmrSeries.at(-1);
  const projB = bucket(finalMMR);
  projRank.textContent = labelRank(projB);
  projMMR.textContent  = finalMMR;
  projWR.textContent   = wrSeries.at(-1).toFixed(0);

  drawSeries(mmrSeries);
  title.textContent = name ? `${name} — 2v2 Doubles` : `2v2 Doubles`;
  out.classList.remove("hide");
});