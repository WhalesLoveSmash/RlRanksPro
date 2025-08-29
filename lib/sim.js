// sim.js — pure logic utilities you can import from script.js if you prefer modules

export function projectMMRPath(startMMR, games, baseWR, regression01, perGameMMR = 9) {
  const pts = [];
  for (let i = 0; i < games; i++) {
    const wrNow = (1 - regression01) * (baseWR / 100) + regression01 * 0.5;
    const expNet = wrNow * perGameMMR + (1 - wrNow) * -perGameMMR;
    pts.push({ game: i + 1, mmr: Math.round((pts[i - 1]?.mmr ?? startMMR) + expNet) });
  }
  return pts;
}

export function rankFromMMR(mmr, playlist, ranks) {
  const cfg = ranks.playlists?.[playlist];
  if (!cfg) return { tierName: 'Unranked', divName: null };
  const tiers = [...cfg.tiers].sort((a, b) => a.min - b.min);
  let idx = 0;
  for (let i = 0; i < tiers.length; i++) {
    if (mmr >= tiers[i].min) idx = i; else break;
  }
  const tier = tiers[idx];
  const nextMin = tiers[idx + 1]?.min ?? (tier.min + (cfg.defaultTierWidth || 100));
  const width = Math.max(4, nextMin - tier.min);
  const step = width / 4;
  const into = Math.max(0, Math.min(nextMin - tier.min - 1, mmr - tier.min));
  const divIdx = Math.min(3, Math.floor(into / step));
  const divNames = ['Div I', 'Div II', 'Div III', 'Div IV'];
  return { tierName: tier.name, divName: divNames[divIdx] };
}