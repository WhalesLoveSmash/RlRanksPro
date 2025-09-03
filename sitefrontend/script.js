/* ---------------- Config ---------------- */
const BASE_WIN = 10, BASE_LOSS = 10;

// Load ranks from JSON
let RANKS = null;
fetch('ranks.json').then(r=>r.ok?r.json():null).then(j=>{
  RANKS=j;
  if(RANKS) populateRankSelect();
});

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

// AI
const aiBtn = document.getElementById("aiBtn");

/* ---------------- Helpers ---------------- */
function roman(n){return["I","II","III","IV"][n-1]||"";}

function populateRankSelect(){
  rankSel.innerHTML="";
  Object.keys(RANKS).forEach(r=>{
    const opt=document.createElement("option");
    opt.value=r; opt.textContent=r;
    rankSel.appendChild(opt);
  });
  updateDivSelect();
}
function updateDivSelect(){
  divSel.innerHTML="";
  const rank=rankSel.value;
  if(!rank||!RANKS[rank]) return;
  const divs=Object.keys(RANKS[rank]);
  divs.forEach(d=>{
    const opt=document.createElement("option");
    opt.value=d; opt.textContent=d;
    divSel.appendChild(opt);
  });
}

/* bucket lookup */
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
  const yScale=v=>gy1-((v-yMin)/(yMax-yMin))*(gy1-gy0);

  // grid
  for(let i=0;i<=4;i++){
    const y=gy0+(i/4)*(gy1-gy0);
    const line=document.createElementNS("http://www.w3.org/2000/svg","line");
    line.setAttribute("x1",gx0);line.setAttribute("y1",y);
    line.setAttribute("x2",gx1);line.setAttribute("y2",y);
    line.setAttribute("class","gridline");
    svg.appendChild(line);
  }

  // path
  const d=series.map((v,i)=>`${i?'L':'M'} ${xScale(i)} ${yScale(v)}`).join(' ');
  const path=document.createElementNS("http://www.w3.org/2000/svg","path");
  path.setAttribute("d",d);path.setAttribute("class","path");
  svg.appendChild(path);

  // markers
  const m0=document.createElementNS("http://www.w3.org/2000/svg","circle");
  m0.setAttribute("cx",xScale(0));m0.setAttribute("cy",yScale(series[0]));
  m0.setAttribute("r",6);m0.setAttribute("class","currMark");
  svg.appendChild(m0);

  const m1=document.createElementNS("http://www.w3.org/2000/svg","circle");
  m1.setAttribute("cx",xScale(series.length-1));m1.setAttribute("cy",yScale(series.at(-1)));
  m1.setAttribute("r",7);m1.setAttribute("class","projMark");
  svg.appendChild(m1);

  x0.textContent=0;
  xMid.textContent=Math.floor((series.length-1)/2);
  xMax.textContent=series.length-1;
}

/* Ladder */
function updateLadder(currBucket,startMMR,projLabel,projBucket,finalMMR){
  tileCurrName.textContent=`${currBucket.rank} ${currBucket.rank==='Supersonic Legend'?'':roman(currBucket.div)}`;
  tileCurrRange.textContent=`${currBucket.min}–${currBucket.max} (mmr ${startMMR})`;

  tileProjName.textContent=projLabel;
  if(projBucket){
    tileProjRange.textContent=`${projBucket.min}–${projBucket.max} (mmr ${finalMMR})`;
  }else{
    tileProjRange.textContent=`mmr ${finalMMR}`;
  }

  const delta=finalMMR-startMMR;
  mmrDelta.textContent=`${delta>=0?'+':''}${delta}`;
  tileProjected.classList.remove('up','down');
  ladderArrow.classList.remove('up','down');
  if(delta>0){tileProjected.classList.add('up');ladderArrow.classList.add('up');}
  else if(delta<0){tileProjected.classList.add('down');ladderArrow.classList.add('down');}
}

/* Explain tooltip */
function showExplain(text){
  tooltip.textContent=text;
  tooltip.classList.remove("hide");
  setTimeout(()=>tooltip.classList.add("hide"),5000);
}

/* ---------------- Events ---------------- */
rankSel.addEventListener("change",updateDivSelect);
elReg.addEventListener("input",()=>{
  const v=Number(elReg.value);
  elRegTag.textContent=`${v}% • ${v>=60?"harsh":v>=30?"medium":"gentle"}`;
});
explainBtn.addEventListener("click",()=>{
  showExplain("Between divisions: you may be on the cusp of ranking up or down. Projection shows the closest band.");
});

btnPredict.addEventListener("click",()=>{
  const rank=rankSel.value;
  const div=divSel.value;
  if(!RANKS||!RANKS[rank]||!RANKS[rank][div]) return;

  const startMMR=elMMROverride.value?Number(elMMROverride.value):Math.round((RANKS[rank][div].min+RANKS[rank][div].max)/2);
  const games=Number(elGames.value||50);
  const winPct=elWin.value?Number(elWin.value):50;
  const reg=Number(elReg.value||14);
  const name=(elName.value||"").trim();

  const currB=bucket(startMMR);
  currRank.textContent=labelRank(currB);
  currMMR.textContent=startMMR;
  currWR.textContent=winPct.toFixed(0);

  const {mmrSeries,wrSeries}=simulateSeries(startMMR,winPct,games,reg);
  const finalMMR=mmrSeries.at(-1);
  const projB=bucket(finalMMR);
  projRank.textContent=projB?labelRank(projB):"—";
  projMMR.textContent=finalMMR;
  projWR.textContent=wrSeries.at(-1).toFixed(0);

  updateLadder(currB,startMMR,projB?`${projB.rank} ${projB.rank==='Supersonic Legend'?'':roman(projB.div)}`:"—",projB,finalMMR);

  drawSeries(mmrSeries);
  title.textContent=name?`${name} — 2v2 Doubles`:`2v2 Doubles`;
  out.classList.remove("hide");
});

/* AI Button */
aiBtn.addEventListener("click",()=>{
  showExplain("AI feature coming soon: Ask about your gameplay, mindset, or setup. (3 free questions, then premium.)");
});