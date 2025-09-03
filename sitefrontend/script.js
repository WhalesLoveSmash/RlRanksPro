/* ---------------- Config ---------------- */
const BASE_WIN = 10, BASE_LOSS = 10;

// Load ranks from JSON
let RANKS = null;
fetch('ranks.json').then(r=>r.ok?r.json():null).then(j=>RANKS=j);

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

/* ---------------- Helpers ---------------- */
function roman(n){return["I","II","III","IV"][n-1]||"";}

function bucket(m){
  if(!RANKS) return null;
  for(const [rank,divs] of Object.entries(RANKS)){
    for(const [d,range] of Object.entries(divs)){
      if(m>=range.min && m<=range.max){
        return {rank,div:Number(d),min:range.min,max:range.max};
      }
    }
  }
  return null;
}
function labelRank(b){return `${b.rank} ${b.rank==='Supersonic Legend'?'':roman(b.div)} (${b.min}–${b.max})`;}

/* Simulation */
function simulateSeries(start,winPct,games,regressPercent){
  let mmr=start;
  let wr=Math.max(0,Math.min(1,winPct/100));
  const mmrSeries=[Math.round(mmr)];
  const wrSeries=[+(wr*100).toFixed(1)];
  const DECAY=Math.min(0.98,Math.max(0.0,regressPercent/100));
  for(let i=0;i<games;i++){
    const diff=wr-0.5;
    wr=0.5+diff*(1-DECAY);
    mmr+=wr*BASE_WIN-(1-wr)*BASE_LOSS;
    mmrSeries.push(Math.round(mmr));
    wrSeries.push(+(wr*100).toFixed(1));
  }
  return {mmrSeries,wrSeries};
}

/* Chart */
function drawSeries(series){
  while(svg.firstChild) svg.removeChild(svg.firstChild);
  const W=800,H=320,P=28;
  const gx0=P,gx1=W-P,gy0=P,gy1=H-P;
  const minY=Math.min(...series),maxY=Math.max(...series);
  const span=Math.max(6,maxY-minY);const pad=Math.ceil(span*0.10)||3;
  const yMin=minY-pad,yMax=maxY+pad;
  const xScale=i=>gx0+(i/(series.length-1))*(gx1-gx0);
  const yScale=v=>gy1-((v-yMin)/(yMax-yMin))*(gy1-gy