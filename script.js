/********** 2v2 division ranges **********/
const R2 = [
  ["Supersonic Legend","—",1861,2105],
  ["Grand Champion III","Div I",1715,1736],
  ["Grand Champion III","Div II",1745,1775],
  ["Grand Champion III","Div III",1788,1815],
  ["Grand Champion III","Div IV",1832,1859],
  ["Grand Champion II","Div I",1575,1597],
  ["Grand Champion II","Div II",1600,1635],
  ["Grand Champion II","Div III",1644,1660],
  ["Grand Champion II","Div IV",1677,1699],
  ["Grand Champion I","Div I",1435,1458],
  ["Grand Champion I","Div II",1462,1496],
  ["Grand Champion I","Div III",1498,1526],
  ["Grand Champion I","Div IV",1537,1559],
  ["Champion III","Div I",1315,1333],
  ["Champion III","Div II",1335,1367],
  ["Champion III","Div III",1368,1396],
  ["Champion III","Div IV",1402,1419],
  ["Champion II","Div I",1195,1213],
  ["Champion II","Div II",1214,1247],
  ["Champion II","Div III",1248,1278],
  ["Champion II","Div IV",1282,1304],
  ["Champion I","Div I",1075,1093],
  ["Champion I","Div II",1094,1127],
  ["Champion I","Div III",1128,1160],
  ["Champion I","Div IV",1162,1180],
  ["Diamond III","Div I",995,1003],
  ["Diamond III","Div II",1004,1027],
  ["Diamond III","Div III",1028,1051],
  ["Diamond III","Div IV",1052,1065],
  ["Diamond II","Div I",915,923],
  ["Diamond II","Div II",924,947],
  ["Diamond II","Div III",948,971],
  ["Diamond II","Div IV",972,987],
  ["Diamond I","Div I",829,843],
  ["Diamond I","Div II",844,867],
  ["Diamond I","Div III",868,891],
  ["Diamond I","Div IV",892,900],
  ["Platinum III","Div I",771,778],
  ["Platinum III","Div II",779,797],
  ["Platinum III","Div III",798,816],
  ["Platinum III","Div IV",817,829],
  ["Platinum II","Div I",713,718],
  ["Platinum II","Div II",719,737],
  ["Platinum II","Div III",738,756],
  ["Platinum II","Div IV",757,774],
  ["Platinum I","Div I",642,658],
  ["Platinum I","Div II",659,677],
  ["Platinum I","Div III",678,696],
  ["Platinum I","Div IV",697,705],
  ["Gold III","Div I",587,598],
  ["Gold III","Div II",599,617],
  ["Gold III","Div III",618,636],
  ["Gold III","Div IV",637,646],
  ["Gold II","Div I",532,538],
  ["Gold II","Div II",539,557],
  ["Gold II","Div III",558,576],
  ["Gold II","Div IV",577,587],
  ["Gold I","Div I",472,478],
  ["Gold I","Div II",479,497],
  ["Gold I","Div III",498,516],
  ["Gold I","Div IV",517,526],
  ["Silver III","Div I",411,418],
  ["Silver III","Div II",419,437],
  ["Silver III","Div III",438,456],
  ["Silver III","Div IV",457,466],
  ["Silver II","Div I",350,358],
  ["Silver II","Div II",359,377],
  ["Silver II","Div III",378,396],
  ["Silver II","Div IV",397,406],
  ["Silver I","Div I",293,298],
  ["Silver I","Div II",299,317],
  ["Silver I","Div III",318,336],
  ["Silver I","Div IV",337,354],
  ["Bronze III","Div I",231,238],
  ["Bronze III","Div II",239,257],
  ["Bronze III","Div III",258,276],
  ["Bronze III","Div IV",277,285],
  ["Bronze II","Div I",170,178],
  ["Bronze II","Div II",179,197],
  ["Bronze II","Div III",198,215],
  ["Bronze II","Div IV",217,222],
  ["Bronze I","Div I",-100,118],
  ["Bronze I","Div II",120,136],
  ["Bronze I","Div III",142,156],
  ["Bronze I","Div IV",157,173],
];

const BASE_WIN = 10, BASE_LOSS = 10;

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
function bucket(m){
  for (const [t,d,lo,hi] of R2){ if(m>=lo && m<=hi) return {t,d,lo,hi}; }
  return m < R2[R2.length-1][2]
    ? {t:"Below Bronze I", d:"—", lo:R2[R2.length-1][2], hi:R2[R2.length-1][2]}
    : {t:"Above SSL", d:"—", lo:R2[0][3], hi:R2[0][3]};
}
function labelRank(b){ return `${b.t}${b.d!=="—" ? " "+b.d:""} (${b.lo}–${b.hi})`; }

function setStatus(msg, ok=false){
  elStatus.textContent = msg;
  elStatus.classList.remove("hide","ok","warn");
  elStatus.classList.add(ok ? "ok" : "warn","status");
}
function clearStatus(){ elStatus.classList.add("hide"); }

function validateUrl(raw){
  try{
    const u = new URL(raw.trim());
    // allow "rocketleague.tracker.network" and "rocket-league.tracker.network"
    if (!/(^|\.)tracker\.network$/.test(u.hostname) || !/rocket-?league\.tracker\.network$/.test(u.hostname)) {
      // Support direct tracker.gg profile pastes too:
      if (!/tracker\.gg$/.test(u.hostname)) return null;
    }
    // RLTracker path style
    let m = u.pathname.match(/\/rocket-?league\/profile\/([^/]+)\/([^/]+)/i);
    // tracker.gg path style
    if (!m) m = u.pathname.match(/\/rocket-?league\/profile\/([^/]+)\/([^/]+)/i);
    if (!m) return null;
    return { href: u.href.replace(/#.*$/,""), platform: m[1], pid: decodeURIComponent(m[2]) };
  }catch{ return null; }
}

/********** API fetch (no HTML scraping) **********/
async function fetchProfileFromAPI(platform, pid){
  // TRN public profile API (no key needed for basic profile read)
  const api = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/${platform}/${encodeURIComponent(pid)}`;
  // CORS-safe plain-text proxy
  const proxied = "https://r.jina.ai/http://" + api.replace(/^https?:\/\//,"");
  const res = await fetch(proxied, {mode:"cors"});
  if (!res.ok) throw new Error(`API fetch failed (${res.status})`);
  const txt = await res.text();
  let json;
  try { json = JSON.parse(txt); } catch { throw new Error("Bad API JSON"); }
  return json;
}

/* Extract Ranked Doubles 2v2 from TRN JSON */
function pickDoubles2v2(json){
  const segs = json?.data?.segments;
  if (!Array.isArray(segs)) throw new Error("No segments in API response.");

  // Prefer explicit 2v2 ranked names, fallback to playlistId 11
  const target = segs.find(s => {
    const name = (s?.metadata?.name || "").toLowerCase();
    return /ranked/.test(name) && /(2v2|doubles)/.test(name);
  }) || segs.find(s => {
    const pid = s?.metadata?.playlistId ?? s?.attributes?.playlistId ?? s?.attributes?.playlistIdValue;
    return String(pid) === "11";
  });

  if (!target) throw new Error("Couldn't find Ranked 2v2 in your profile.");

  const stats = target.stats || {};
  const mmr = Number(
    (stats.rating?.value ?? stats.mmr?.value ?? stats.rankScore?.value)
  );
  if (!Number.isFinite(mmr)) throw new Error("2v2 MMR missing in API.");

  let winPct = Number(stats.winRatio?.value);
  if (!Number.isFinite(winPct)) {
    const wins = Number(stats.wins?.value);
    const losses = Number(stats.losses?.value);
    if (Number.isFinite(wins) && Number.isFinite(losses) && (wins+losses)>0) {
      winPct = (wins/(wins+losses))*100;
    }
  }

  return { mmr: Math.round(mmr), winPct: Number.isFinite(winPct) ? Math.round(winPct) : null };
}

/********** end API helpers **********/

async function fetchAndFill(){
  clearStatus();
  const v = validateUrl(elUrl.value || "");
  if (!v){
    setStatus("Enter a valid RLTracker profile URL (rocketleague.tracker.network/.../profile/<platform>/<id>).", false);
    return;
  }

  elFetch.disabled = true; elFetch.textContent = "Fetching…";
  try{
    const data = await fetchProfileFromAPI(v.platform, v.pid);
    const { mmr, winPct } = pickDoubles2v2(data);
    elMMR.value = String(mmr);
    if (winPct != null) elWin.value = String(winPct);
    setStatus("Fetched Ranked 2v2 MMR and Win% from Tracker Network.", true);
  }catch(err){
    setStatus(err?.message || "Fetch failed.", false);
  }finally{
    elFetch.disabled = false; elFetch.textContent = "Fetch Ranked 2v2";
  }
}

/********** projection + chart **********/
function simulateSeries(start, winPct, games, regressPercent){
  const DECAY = (regressPercent/100)*0.02; // gentle regression per game toward 50%
  let mmr = start;
  let wr = Math.max(0, Math.min(1, winPct/100));
  const arr = [Math.round(mmr)];
  const wrSeries = [+(wr*100).toFixed(1)];
  for(let i=0;i<games;i++){
    const diff = wr - 0.5;
    wr = 0.5 + diff*(1-DECAY);
    mmr += wr*BASE_WIN - (1-wr)*BASE_LOSS;
    arr.push(Math.round(mmr));
    wrSeries.push(+(wr*100).toFixed(1));
  }
  return { mmrSeries: arr, wrSeries };
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

  // gridlines
  for(let i=0;i<=4;i++){
    const y = gy0 + i*(gy1-gy0)/4;
    const gl = document.createElementNS("http://www.w3.org/2000/svg","line");
    gl.setAttribute("x1",gx0); gl.setAttribute("x2",gx1);
    gl.setAttribute("y1",y); gl.setAttribute("y2",y);
    gl.setAttribute("class","gridline");
    svg.appendChild(gl);
  }

  // path
  let d = "";
  series.forEach((v,i)=>{
    const x = xScale(i), y = yScale(v);
    d += (i===0?`M ${x} ${y}`:` L ${x} ${y}`);
  });
  const path = document.createElementNS("http://www.w3.org/2000/svg","path");
  path.setAttribute("d", d);
  path.setAttribute("class","path");
  svg.appendChild(path);

  // markers
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

/********** rank labeling **********/
function toRankLabel(m) {
  const b = bucket(m);
  return `${b.t}${b.d !== "—" ? " " + b.d : ""}`;
}

/********** UI wiring **********/
function updateRegressTag(){
  const v = Number(elReg.value)||0;
  let label = "low";
  if (v >= 66) label = "high";
  else if (v >= 33) label = "medium";
  elRegTag.textContent = `${v}% • ${label}`;
}

function doPredict(){
  clearStatus();
  const start = Number(elMMR.value);
  const wr = Number(elWin.value);
  const games = Math.max(1, Math.min(200, Number(elGames.value)||25));
  const regress = Math.max(0, Math.min(100, Number(elReg.value)||30));

  if (!Number.isFinite(start)) { setStatus("Enter a valid MMR (or fetch first).", false); return; }
  if (!Number.isFinite(wr))    { setStatus("Enter a valid recent Win%.", false); return; }

  const { mmrSeries, wrSeries } = simulateSeries(start, wr, games, regress);
  const end = mmrSeries[mmrSeries.length-1];

  // output surface
  out.classList.remove("hide");
  const name = (elName.value || "").trim();
  title.textContent = "2v2 Doubles" + (name ? ` — ${name}` : "");

  const currB = bucket(start), projB = bucket(end);
  currRank.textContent = toRankLabel(start);
  projRank.textContent = toRankLabel(end);
  currMMR.textContent = String(start);
  projMMR.textContent = String(end);
  currWR.textContent = String(Math.round(wr));
  projWR.textContent = String(Math.round(wrSeries[wrSeries.length-1]));

  x0.textContent = "0";
  xMid.textContent = String(Math.round(games/2));
  xEnd.textContent = String(games);

  drawSeries(mmrSeries);
}

/********** events **********/
elFetch.addEventListener("click", fetchAndFill);
elReg.addEventListener("input", updateRegressTag);
document.getElementById("btnPredict").addEventListener("click", doPredict);

// init
updateRegressTag();