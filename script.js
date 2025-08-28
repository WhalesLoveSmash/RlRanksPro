/***** 2v2 (Ranked Doubles) division ranges from screenshot *****/
const RANKS_2V2 = [
  // [Tier, Division, lo, hi]
  ["Supersonic Legend", "—", 1861, 2105],

  ["Grand Champion III", "Div I", 1715, 1736],
  ["Grand Champion III", "Div II", 1745, 1775],
  ["Grand Champion III", "Div III", 1788, 1815],
  ["Grand Champion III", "Div IV", 1832, 1859],

  ["Grand Champion II", "Div I", 1575, 1597],
  ["Grand Champion II", "Div II", 1600, 1635],
  ["Grand Champion II", "Div III", 1644, 1660],
  ["Grand Champion II", "Div IV", 1677, 1699],

  ["Grand Champion I", "Div I", 1435, 1458],
  ["Grand Champion I", "Div II", 1462, 1496],
  ["Grand Champion I", "Div III", 1498, 1526],
  ["Grand Champion I", "Div IV", 1537, 1559],

  ["Champion III", "Div I", 1315, 1333],
  ["Champion III", "Div II", 1335, 1367],
  ["Champion III", "Div III", 1368, 1396],
  ["Champion III", "Div IV", 1402, 1419],

  ["Champion II", "Div I", 1195, 1213],
  ["Champion II", "Div II", 1214, 1247],
  ["Champion II", "Div III", 1248, 1278],
  ["Champion II", "Div IV", 1282, 1304],

  ["Champion I", "Div I", 1075, 1093],
  ["Champion I", "Div II", 1094, 1127],
  ["Champion I", "Div III", 1128, 1160],
  ["Champion I", "Div IV", 1162, 1180],

  ["Diamond III", "Div I", 995, 1003],
  ["Diamond III", "Div II", 1004, 1027],
  ["Diamond III", "Div III", 1028, 1051],
  ["Diamond III", "Div IV", 1052, 1065],

  ["Diamond II", "Div I", 915, 923],
  ["Diamond II", "Div II", 924, 947],
  ["Diamond II", "Div III", 948, 971],
  ["Diamond II", "Div IV", 972, 987],

  ["Diamond I", "Div I", 829, 843],
  ["Diamond I", "Div II", 844, 867],
  ["Diamond I", "Div III", 868, 891],
  ["Diamond I", "Div IV", 892, 900],

  ["Platinum III", "Div I", 771, 778],
  ["Platinum III", "Div II", 779, 797],
  ["Platinum III", "Div III", 798, 816],
  ["Platinum III", "Div IV", 817, 829],

  ["Platinum II", "Div I", 713, 718],
  ["Platinum II", "Div II", 719, 737],
  ["Platinum II", "Div III", 738, 756],
  ["Platinum II", "Div IV", 757, 774],

  ["Platinum I", "Div I", 642, 658],
  ["Platinum I", "Div II", 659, 677],
  ["Platinum I", "Div III", 678, 696],
  ["Platinum I", "Div IV", 697, 705],

  ["Gold III", "Div I", 587, 598],
  ["Gold III", "Div II", 599, 617],
  ["Gold III", "Div III", 618, 636],
  ["Gold III", "Div IV", 637, 646],

  ["Gold II", "Div I", 532, 538],
  ["Gold II", "Div II", 539, 557],
  ["Gold II", "Div III", 558, 576],
  ["Gold II", "Div IV", 577, 587],

  ["Gold I", "Div I", 472, 478],
  ["Gold I", "Div II", 479, 497],
  ["Gold I", "Div III", 498, 516],
  ["Gold I", "Div IV", 517, 526],

  ["Silver III", "Div I", 411, 418],
  ["Silver III", "Div II", 419, 437],
  ["Silver III", "Div III", 438, 456],
  ["Silver III", "Div IV", 457, 466],

  ["Silver II", "Div I", 350, 358],
  ["Silver II", "Div II", 359, 377],
  ["Silver II", "Div III", 378, 396],
  ["Silver II", "Div IV", 397, 406],

  ["Silver I", "Div I", 293, 298],
  ["Silver I", "Div II", 299, 317],
  ["Silver I", "Div III", 318, 336],
  ["Silver I", "Div IV", 337, 354],

  ["Bronze III", "Div I", 231, 238],
  ["Bronze III", "Div II", 239, 257],
  ["Bronze III", "Div III", 258, 276],
  ["Bronze III", "Div IV", 277, 285],

  ["Bronze II", "Div I", 170, 178],
  ["Bronze II", "Div II", 179, 197],
  ["Bronze II", "Div III", 198, 215],
  ["Bronze II", "Div IV", 217, 222],

  ["Bronze I", "Div I", -100, 118],
  ["Bronze I", "Div II", 120, 136],
  ["Bronze I", "Div III", 142, 156],
  ["Bronze I", "Div IV", 157, 173],
];

/***** Config *****/
const BASE_MMR_PER_WIN = 10;
const BASE_MMR_PER_LOSS = 10;

const GLOBAL_MIN = RANKS_2V2[RANKS_2V2.length - 1][2];
const GLOBAL_MAX = RANKS_2V2[0][3];
const TOTAL_SPAN = GLOBAL_MAX - GLOBAL_MIN;

/***** DOM *****/
const form = document.getElementById("player-form");
const playerInput = document.getElementById("player");
const mmrInput = document.getElementById("currentMMR");
const winrateInput = document.getElementById("winrate");
const gamesInput = document.getElementById("games");
const regressInput = document.getElementById("regress");
const regressVal = document.getElementById("regressVal");
const fetchWRBtn = document.getElementById("fetchWR");
const trackerUrlInput = document.getElementById("trackerUrl");

const results = document.getElementById("results");
const playerLabel = document.getElementById("playerLabel");
const mmrOut = document.getElementById("mmr");
const rankOut = document.getElementById("currRankText");
const projGamesOut = document.getElementById("projGames");
const projMMROut = document.getElementById("projMMR");
const projMMROut2 = document.getElementById("projMMR2");
const projRankOut = document.getElementById("projRank");
const rankbar = document.getElementById("rankbar");
const tierLabels = document.getElementById("tierLabels");
const badgeCurrent = document.getElementById("badgeCurrent");
const badgeProjected = document.getElementById("badgeProjected");

/***** Helpers *****/
function findBucket(mmr) {
  for (const [tier, div, lo, hi] of RANKS_2V2) {
    if (mmr >= lo && mmr <= hi) return { tier, div, lo, hi };
  }
  if (mmr < GLOBAL_MIN) return { tier: "Below Bronze I", div: "—", lo: GLOBAL_MIN, hi: GLOBAL_MIN };
  return { tier: "Above SSL", div: "—", lo: GLOBAL_MAX, hi: GLOBAL_MAX };
}
function tierNameOf(t){ return (t || "").split(" ")[0]; }

function buildTierRanges(){
  const map = new Map();
  for (const [tier, div, lo, hi] of RANKS_2V2){
    const major = tierNameOf(tier);
    if(!map.has(major)) map.set(major, { name: major, lo, hi });
    const obj = map.get(major);
    obj.lo = Math.min(obj.lo, lo);
    obj.hi = Math.max(obj.hi, hi);
  }
  return Array.from(map.values()).sort((a,b)=>a.lo-b.lo);
}

function projectMMR(current, winratePct, games, regressionPercent){
  // Convert regression strength (0..100) to a per-game decay toward 50%.
  // 0  -> 0   (no regression)
  // 100-> 0.02 (fast)
  const DECAY_STEP = (regressionPercent/100) * 0.02;
  let mmr = current;
  let wr = Math.max(0, Math.min(1, winratePct/100));
  for (let i=0;i<games;i++){
    const diffFrom50 = wr - 0.5;
    wr = 0.5 + diffFrom50 * (1 - DECAY_STEP);
    mmr += wr*BASE_MMR_PER_WIN - (1-wr)*BASE_MMR_PER_LOSS;
  }
  return Math.round(mmr);
}

/***** Graph *****/
function clear(node){ while(node.firstChild) node.removeChild(node.firstChild); }

function renderTrack(){
  clear(rankbar);
  clear(tierLabels);

  // Division segments (fine-grained)
  RANKS_2V2.slice().reverse().forEach(([tier, div, lo, hi])=>{
    const seg = document.createElement("div");
    seg.className = "rank-seg";
    seg.style.width = ((hi - lo + 1)/TOTAL_SPAN)*100 + "%";
    seg.title = `${tier}${div!=="—" ? " ("+div+")": ""} ${lo}–${hi}`;
    rankbar.appendChild(seg);
  });

  // Tier labels (coarse)
  const tiers = buildTierRanges();
  tiers.forEach(t=>{
    const span = document.createElement("div");
    span.className = "rank-label";
    span.style.width = ((t.hi - t.lo + 1)/TOTAL_SPAN)*100 + "%";
    span.textContent = t.name;
    tierLabels.appendChild(span);
  });
}

function placePin(value, kind){
  const percent = ((value - GLOBAL_MIN)/TOTAL_SPAN)*100;
  const pin = document.createElement("div");
  const label = document.createElement("div");
  pin.className = `pin ${kind}`;
  label.className = `pin-label ${kind}`;
  pin.style.left = percent + "%";
  label.style.left = percent + "%";
  label.textContent = value;
  rankbar.appendChild(pin);
  rankbar.appendChild(label);
}

function colorForTier(tier){
  const t = tierNameOf(tier);
  if (t==="Bronze") return "linear-gradient(180deg,#8e5b2a,#5c3b1c)";
  if (t==="Silver") return "linear-gradient(180deg,#bfc6ce,#7a8a9c)";
  if (t==="Gold") return "linear-gradient(180deg,#f3d36b,#a88a2a)";
  if (t==="Platinum") return "linear-gradient(180deg,#6de0ff,#1b6b83)";
  if (t==="Diamond") return "linear-gradient(180deg,#69aaff,#2056a8)";
  if (t==="Champion") return "linear-gradient(180deg,#c699ff,#6c3ad6)";
  if (t==="Grand") return "linear-gradient(180deg,#ff78b8,#9a1f66)";
  if (t==="Supersonic") return "linear-gradient(180deg,#ffffff,#b9c3ff)";
  return "linear-gradient(180deg,#465366,#1e2736)";
}

function setBadge(el, bucket, mmrVal){
  el.style.background = `linear-gradient(180deg,#0f1625,#0e1522)`;
  el.style.borderImage = "initial";
  el.querySelector(".badge-rank").textContent =
    `${bucket.tier}${bucket.div!=="—" ? " "+bucket.div:""} (${bucket.lo}–${bucket.hi})`;
  el.querySelector(".badge-mmr span")?.remove;
  const mmrSpan = el.querySelector(".badge-mmr span") || el.querySelector(".badge-mmr");
  if (mmrSpan.id !== "mmr" && mmrSpan.id !== "projMMR"){
    // do nothing, ids already wired in DOM
  }
  el.style.border = "1px solid #2d3d58";
  el.style.boxShadow = "inset 0 0 0 9999px rgba(0,0,0,0)";

  // Accent strip
  el.style.setProperty("--accentStrip", colorForTier(bucket.tier));
  el.style.background = `linear-gradient(180deg,#0f1625,#0e1522), ${colorForTier(bucket.tier)}`;
  el.style.backgroundBlendMode = "normal, multiply";
}

/***** RLTracker Win Rate (optional, demo via read-only proxy) *****
  - Paste full RLTracker profile URL in the input.
  - We fetch text using r.jina.ai proxy (CORS-friendly read-only).
  - We look for "Win %" followed by a number.
*******************************************************************/
async function fetchWinRateFromRLTracker(url){
  if(!/^https?:\/\/.*?tracker\.network/i.test(url)) throw new Error("Paste a valid RLTracker profile URL.");
  const proxied = "https://r.jina.ai/http://" + url.replace(/^https?:\/\//,"");
  const res = await fetch(proxied, {mode:"cors"});
  if(!res.ok) throw new Error("Fetch failed.");
  const text = await res.text();

  // Try to find "Win %" like 'Win % 58' or 'Win % 58.3'
  const m = text.match(/Win\s*%[^0-9]{0,6}(\d{1,3}(?:\.\d+)?)/i);
  if(!m) throw new Error("Could not find Win % on page.");
  const val = Math.max(0, Math.min(100, parseFloat(m[1])));
  return Math.round(val);
}

/***** UI Events *****/
regressInput.addEventListener("input", () => {
  const v = Number(regressInput.value);
  let tag = "gentle";
  if (v >= 60) tag = "harsh";
  else if (v >= 25) tag = "medium";
  regressVal.textContent = `${v}% (${tag})`;
});

fetchWRBtn.addEventListener("click", async () => {
  const url = trackerUrlInput.value.trim();
  if (!url) return alert("Paste your RLTracker profile URL first.");
  fetchWRBtn.disabled = true; fetchWRBtn.textContent = "Fetching…";
  try{
    const wr = await fetchWinRateFromRLTracker(url);
    winrateInput.value = String(wr);
  }catch(err){
    alert("Fetch failed: " + (err?.message || err));
  }finally{
    fetchWRBtn.disabled = false; fetchWRBtn.textContent = "Fetch WR";
  }
});

form.addEventListener("submit", (e)=>{
  e.preventDefault();

  const player = (playerInput.value || "Player").trim();
  const currentMMR = Number(mmrInput.value || 1065);
  const winratePct = Number(winrateInput.value || 50);
  const games = Number(gamesInput.value || 25);
  const regression = Number(regressInput.value || 15);

  results.classList.remove("hidden");
  playerLabel.textContent = `${player} — 2v2 Doubles`;

  // Current
  const curr = findBucket(currentMMR);
  mmrOut.textContent = currentMMR;
  rankOut.textContent = `${curr.tier}${curr.div!=="—" ? " "+curr.div:""} (${curr.lo}–${curr.hi})`;
  setBadge(badgeCurrent, curr, currentMMR);

  // Projection
  const projected = projectMMR(currentMMR, winratePct, games, regression);
  projGamesOut.textContent = games;
  projMMROut.textContent = projected;
  projMMROut2.textContent = projected;

  const proj = findBucket(projected);
  projRankOut.textContent = `${proj.tier}${proj.div!=="—" ? " "+proj.div:""} (${proj.lo}–${proj.hi})`;
  document.getElementById("projRankText").textContent = projRankOut.textContent;
  setBadge(badgeProjected, proj, projected);

  // Track
  renderTrack();
  placePin(currentMMR, "curr");
  placePin(projected, "proj");
});

// First render
renderTrack();