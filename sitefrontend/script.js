/********** DOM **********/
const elUrl = document.getElementById("trackerUrl");
const elFetch = document.getElementById("btnFetch");
const elStatus = document.getElementById("fetchStatus");

const elMMR = document.getElementById("mmr");
const elWin = document.getElementById("win");
const elName = document.getElementById("name");

const elGames = document.getElementById("games");
const elReg = document.getElementById("regress");
const elRegTag = document.getElementById("regressTag");

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
const xEnd = document.getElementById("xEnd");

/********** helpers **********/
function setStatus(msg, ok=false){
  elStatus.textContent = msg;
  elStatus.classList.remove("hide","ok","warn");
  elStatus.classList.add(ok ? "ok" : "warn","status");
}
function clearStatus(){ elStatus.classList.add("hide"); }

function normalizeProfileUrl(raw){
  try{
    const u = new URL(raw.trim());
    if(!/tracker\.network$|tracker\.gg$/.test(u.hostname)) return null;
    const m = u.pathname.match(/\/rocket-?league\/profile\/([^/]+)\/([^/]+)(?:\/overview)?/i);
    if(!m) return null;
    return { platform: m[1], pid: decodeURIComponent(m[2]) };
  }catch{ return null; }
}

function drawSeries(series){
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const W = 800, H = 320, P = 28;
  const gx0 = P, gx1 = W - P, gy0 = P, gy1 = H - P;

  const minY = Math.min(...series);
  const maxY = Math.max(...series);
  const span = Math.max(6, maxY - minY);
  const pad = Math.ceil(span * 0.10) || 3;
  const yMin = minY - pad;
  const yMax = maxY + pad;

  const xScale = i => gx0 + (i/(series.length-1))*(gx1-gx0);
  const yScale = v => gy1 - ((v - yMin)/(yMax - yMin))*(gy1-gy0);

  for(let i=0;i<=4;i++){
    const y = gy0 + i*(gy1-gy0)/4;
    const gl = document.createElementNS("http://www.w3.org/2000/svg","line");
    gl.setAttribute("x1",gx0); gl.setAttribute("x2",gx1);
    gl.setAttribute("y1",y); gl.setAttribute("y2",y);
    gl.setAttribute("class","gridline");
    svg.appendChild(gl);
  }

  let d = "";
  series.forEach((v,i)=>{
    const x = xScale(i), y = yScale(v);
    d += (i===0?`M ${x} ${y}`:` L ${x} ${y}`);
  });
  const path = document.createElementNS("http://www.w3.org/2000/svg","path");
  path.setAttribute("d", d);
  path.setAttribute("class", "path");
  svg.appendChild(path);

  const addDot = (i, cls) => {
    const c = document.createElementNS("http://www.w3.org/2000/svg","circle");
    c.setAttribute("cx", xScale(i));
    c.setAttribute("cy", yScale(series[i]));
    c.setAttribute("r", 5);
    c.setAttribute("class", cls);
    svg.appendChild(c);
  };
  addDot(0, "currMark");
  addDot(series.length-1, "projMark");
}

function updateRegressTag(){
  const v = Number(elReg.value)||0;
  let label = "low";
  if (v >= 66) label = "high";
  else if (v >= 33) label = "medium";
  elRegTag.textContent = `${v}% • ${label}`;
}

/********** Backend calls **********/
async function fetchProfile(platform, pid){
  const res = await fetch(`/profile/${platform}/${encodeURIComponent(pid)}`);
  if (!res.ok) throw new Error(`Profile fetch failed (${res.status})`);
  return await res.json(); // { mmr, winPct }
}

async function predictServer({ mmr, winPct, games, regress, playlistId=11 }){
  const res = await fetch('/predict', {
    method: 'POST',
    headers: { 'content-type':'application/json' },
    body: JSON.stringify({ mmr, winPct, games, regress, playlistId })
  });
  if (!res.ok) throw new Error(`Prediction failed (${res.status})`);
  return await res.json(); // { mmrSeries, wrSeries, current, projected, playlistId }
}

/********** UI actions **********/
async function fetchAndFill(){
  clearStatus();
  const norm = normalizeProfileUrl(elUrl.value || "");
  if (!norm){ setStatus("Paste a valid Rocket League Tracker profile URL.", false); return; }

  elFetch.disabled = true; elFetch.textContent = "Fetching…";
  try{
    const { mmr, winPct } = await fetchProfile(norm.platform, norm.pid);
    elMMR.value = String(mmr);
    if (winPct != null) elWin.value = String(winPct);
    setStatus("Fetched Ranked 2v2 MMR and Win%.", true);
  }catch(err){
    setStatus(err?.message || "Fetch failed.", false);
  }finally{
    elFetch.disabled = false; elFetch.textContent = "Fetch Ranked 2v2";
  }
}

async function doPredict(){
  clearStatus();
  const mmr = Number(elMMR.value);
  const winPct = Number(elWin.value);
  const games = Math.max(1, Math.min(200, Number(elGames.value)||25));
  const regress = Math.max(0, Math.min(100, Number(elReg.value)||30));

  if (!Number.isFinite(mmr)) { setStatus("Enter a valid MMR (or fetch first).", false); return; }
  if (!Number.isFinite(winPct)) { setStatus("Enter a valid recent Win%.", false); return; }

  try{
    const data = await predictServer({ mmr, winPct, games, regress, playlistId: 11 });
    out.classList.remove("hide");
    const name = (elName.value || "").trim();
    title.textContent = "2v2 Doubles" + (name ? ` — ${name}` : "");

    currRank.textContent = data.current.rank;
    projRank.textContent = data.projected.rank;
    currMMR.textContent = String(data.current.mmr);
    projMMR.textContent = String(data.projected.mmr);
    currWR.textContent = String(data.current.wr);
    projWR.textContent = String(data.projected.wr);

    x0.textContent = "0";
    xMid.textContent = String(Math.round(games/2));
    xEnd.textContent = String(games);

    drawSeries(data.mmrSeries);
  }catch(e){
    setStatus(e.message || "Prediction failed.", false);
  }
}

/********** Events & init **********/
elFetch.addEventListener("click", fetchAndFill);
document.getElementById("btnPredict").addEventListener("click", doPredict);
elReg.addEventListener("input", updateRegressTag);

if (elUrl) elUrl.removeAttribute("placeholder");
elUrl?.addEventListener("keydown", (e)=>{ if(e.key==="Enter") fetchAndFill(); });

updateRegressTag();