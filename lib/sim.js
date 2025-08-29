// lib/sim.js
const BASE_WIN = 10, BASE_LOSS = 10;

function simulateSeries(start, winPct, games, regressPercent){
  const DECAY = (regressPercent/100)*0.02;
  let mmr = start;
  let wr = Math.max(0, Math.min(1, winPct/100));
  const mmrSeries = [Math.round(mmr)];
  const wrSeries = [+(wr*100).toFixed(1)];
  for(let i=0;i<games;i++){
    const diff = wr - 0.5;
    wr = 0.5 + diff*(1-DECAY);
    mmr += wr*BASE_WIN - (1-wr)*BASE_LOSS;
    mmrSeries.push(Math.round(mmr));
    wrSeries.push(+(wr*100).toFixed(1));
  }
  return { mmrSeries, wrSeries };
}

module.exports = { simulateSeries };