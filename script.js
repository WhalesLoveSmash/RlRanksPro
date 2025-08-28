// ====== 2v2 (Ranked Doubles) — live division ranges from your screenshots ======
const RANKS_2V2 = [
  // [Rank, Division, lo, hi]
  ["Supersonic Legend", "—", 1861, 2105], // SSL shown with one bucket

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

// Typical per-result change (tune if you want)
const BASE_MMR_PER_WIN = 10;
const BASE_MMR_PER_LOSS = 10;

// ====== DOM ======
const form = document.getElementById("player-form");
const playerInput = document.getElementById("player");
const winrateInput = document.getElementById("winrate");
const gamesInput = document.getElementById("games");

const results = document.getElementById("results");
const playerLabel = document.getElementById("playerLabel");
const mmrOut = document.getElementById("mmr");
const rankOut = document.getElementById("rank");
const rankbar = document.getElementById("rankbar");
const projGamesOut = document.getElementById("projGames");
const projMMROut = document.getElementById("projMMR");
const projRankOut = document.getElementById("projRank");

// ====== Helpers ======
const GLOBAL_MIN = RANKS_2V2[RANKS_2V2.length - 1][2]; // lowest lo
const GLOBAL_MAX = RANKS_2V2[0][3];                      // highest hi
const TOTAL_SPAN = GLOBAL_MAX - GLOBAL_MIN;

function findRank2v2(mmr) {
  for (const [rank, div, lo, hi] of RANKS_2V2) {
    if (mmr >= lo && mmr <= hi) return { rank, div, lo, hi };
  }
  // below/above tables
  if (mmr < GLOBAL_MIN) return { rank: "Below Bronze I", div: "—", lo: GLOBAL_MIN, hi: GLOBAL_MIN };
  return { rank: "Above SSL", div: "—", lo: GLOBAL_MAX, hi: GLOBAL_MAX };
}

function renderRankBar2v2(mmr) {
  rankbar.innerHTML = "";

  // Build segments for every division bucket
  RANKS_2V2.slice().reverse().forEach(([rank, div, lo, hi], i, arr) => {
    const seg = document.createElement("div");
    seg.className = "rank-seg";
    seg.style.width = ((hi - lo + 1) / TOTAL_SPAN) * 100 + "%";
    seg.title = `${rank} ${div !== "—" ? "(" + div + ")" : ""} ${lo}–${hi}`;
    rankbar.appendChild(seg);
  });

  // Pin + label
  const percent = ((mmr - GLOBAL_MIN) / TOTAL_SPAN) * 100;
  const pin = document.createElement("div");
  pin.className = "pin";
  pin.style.left = percent + "%";

  const pinLabel = document.createElement("div");
  pinLabel.className = "pin-label";
  pinLabel.style.left = percent + "%";
  pinLabel.textContent = mmr;

  rankbar.appendChild(pin);
  rankbar.appendChild(pinLabel);
}

function projectMMR(current, winratePct, games, mmrWin = BASE_MMR_PER_WIN, mmrLoss = BASE_MMR_PER_LOSS) {
  // Simple “drift toward 50% WR” model
  const DECAY_STEP = 0.003;
  let mmr = current;
  let wr = Math.max(0, Math.min(1, winratePct / 100));
  for (let i = 0; i < games; i++) {
    const diffFrom50 = wr - 0.5;
    wr = 0.5 + diffFrom50 * (1 - DECAY_STEP);
    mmr += wr * mmrWin - (1 - wr) * mmrLoss;
  }
  return Math.round(mmr);
}

// ====== Placeholder fetch (swap later for real data) ======
async function fetchCurrentMMR(/*player*/) {
  // For now, ask the user if you want a quick demo:
  // return Number(prompt("Enter your current 2v2 MMR:", "1065")) || 1065;

  // If you prefer silent demo, set a default:
  return 1065; // Diamond III Div IV-ish from the table
}

// ====== Wire Up (lock to 2v2) ======
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const player = playerInput.value.trim();
  const winratePct = Number(winrateInput.value || 0);
  const games = Number(gamesInput.value || 0);
  if (!player || !games) return;

  playerLabel.textContent = `${player} — 2v2 Doubles`;
  results.classList.remove("hidden");

  // 1) Current MMR
  const currentMMR = await fetchCurrentMMR(player);
  mmrOut.textContent = currentMMR;

  // 2) Current rank + bar
  const curr = findRank2v2(currentMMR);
  rankOut.textContent = `${curr.rank}${curr.div !== "—" ? " " + curr.div : ""} (${curr.lo}–${curr.hi})`;
  renderRankBar2v2(currentMMR);

  // 3) Projection
  const projected = projectMMR(currentMMR, winratePct, games);
  projGamesOut.textContent = games;
  projMMROut.textContent = projected;

  const proj = findRank2v2(projected);
  projRankOut.textContent = `${proj.rank}${proj.div !== "—" ? " " + proj.div : ""} (${proj.lo}–${proj.hi})`;
});