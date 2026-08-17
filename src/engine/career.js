import {S} from '../core/state.js?v=1.5.0';
import {DPN, POSN, POS_ADJ_RUNS} from '../data/abilities.js?v=1.5.0';
import {LG_N} from '../data/teams.js?v=1.5.0';
import {TIER_TH, MILESTONE_DEF} from '../data/economy.js?v=1.5.0';
import {fmtIP, slgOf, roleName3, baseballERA, baseballWHIP} from './season.js?v=1.5.0';
/* ================= 生涯終章 ================= */
export function positionScore(st){
  if(!st||!st.DPG)return 0;
  let runs=0; Object.entries(st.DPG).forEach(([dp,g])=>{ runs+=(POS_ADJ_RUNS[dp]||0)*(g/162); });
  return runs*6; /* 與 DEF 每 1 defensive run = 6 分使用同一尺度 */
}
/* 後援名人堂校準：300 救援接近候選、400 救援具入選實力、500 救援可挑戰最高門檻。 */
export function reliefMilestoneScore(st){
  const sv=st&&st.SV||0;
  if(sv>=500)return 1800;
  if(sv>=400)return 1200;
  if(sv>=300)return 800;
  if(sv>=200)return 350;
  return 0;
}
export function pitcherCareerScore(st){
  return st.W*13+(st.SV||0)*8+(st.HLD||0)*3+st.SO*0.9+st.IP*0.35+reliefMilestoneScore(st);
}
export function careerScore(st){
  if(S.pos==='P')return pitcherCareerScore(st);
  return st.H+st.HR*3+st.SB*0.8+st.RBI*0.5+st.BB*0.3+(st.DEF||0)*6+positionScore(st);
}
export function primaryPos(){ /* 生涯主守位:過半→該位;無過半→工具人/搖擺人(年數降序) */
  if(S.pos==='P'){
    const ry=S.roleYears||{}; const tot=Object.values(ry).reduce((a,b)=>a+b,0);
    if(!tot)return roleName3(S.role);
    const es=Object.entries(ry).sort((a,b)=>b[1]-a[1]);
    if(es[0][1]>=tot/2)return roleName3(es[0][0]); /* 有過半 */
    /* 無過半:搖擺人(附主要兩種定位) */
    const list=es.map(e=>({SP:'先發',MR:'中繼',CL:'終結者'}[e[0]]||'')).filter(Boolean);
    return '搖擺人('+list.slice(0,2).join('、')+')';
  }
  const dy=S.dposYears||{}; const total=Object.values(dy).reduce((a,b)=>a+b,0);
  if(!total)return S.dpos?DPN[S.dpos]:POSN[S.pos];
  const entries=Object.entries(dy).sort((a,b)=>b[1]-a[1]);
  if(entries[0][1]>=total/2)return DPN[entries[0][0]]||entries[0][0]; /* 有過半 */
  const noDH=entries.filter(e=>e[0]!=='DH'&&e[0]!=='—').map(e=>DPN[e[0]]||e[0]);
  if(!noDH.length)return DPN['DH'];
  return '工具人('+noDH.join('、')+')';
}
export function capTeam(bucket){ /* 該聯盟效力最久的球隊,作為名人堂帽徽 */
  const tb=(S.teamTally&&S.teamTally[bucket])||{}; let best=null,bn=-1;
  for(const k in tb)if(tb[k]>bn){bn=tb[k];best=k;}
  return best;
}
export function defShare(bucket){ /* 守備貢獻占生涯總價值比重 0~1 */
  const st=S.stats[bucket]; if(!st||S.pos==='P')return 0;
  const off=st.H+st.HR*3+st.SB*0.8+st.RBI*0.5+st.BB*0.3;
  const def=Math.max(0,st.DEF||0)*6;
  return (off+def)>0?def/(off+def):0;
}
export function posLegendPhrase(bucket){ /* 依守備占比與獎項決定守位敘述 */
  const share=defShare(bucket), st=S.stats[bucket];
  const dp=S.dpos||(S.pos==='C'?'C':null);
  const hasGlove=S.honors.some(h=>h.includes('金手套')||h.includes('守備聖經'));
  if(S.pos==='P'||!dp||dp==='DH')return '';
  const posN=DPN[dp]||'';
  if(share>=0.34||(hasGlove&&share>=0.22))return `，以${{SS:'史上最偉大的游擊手之一',CF:'守備範圍撼動聯盟的中外野手',C:'蹲捕藝術的化身',_:'守備傳奇'}[dp]||('頂尖'+posN)}之姿`;
  if(hasGlove&&share>=0.12)return `，一位攻守俱佳的${posN}`;
  return '';
}
export function honorScore(bucket){
  const lg={CPBL:'中職',NPB:'日職',MLB:'大聯盟'}[bucket];
  const champ={CPBL:'中職總冠軍',NPB:'日本一',MLB:'世界大賽冠軍'}[bucket];
  const isAce=h=>h.includes('最佳投手')||h.includes('賽揚');
  let sc=0,mvp=0,aceN=0,king=0;
  S.honors.forEach(h=>{
    if(h.includes(champ)){sc+=90;return;}
    if(!h.includes(lg))return;
    if(isAce(h)){sc+=460;aceN++;return;}
    if(h.includes('年度MVP')){sc+=420;mvp++;}
    else if(h.includes('新人王'))sc+=140;
    else if(h.includes('金手套')){sc+=300;king++;}
    else if(h.includes('守備聖經')){sc+=220;king++;}
    else if(h.includes('救援王')){sc+=280;king++;}
    else if(h.includes('中繼王')){sc+=210;king++;}
    else if(h.includes('王')){sc+=160;king++;}
    else if(h.includes('明星賽'))sc+=(S.pos==='P'?70:40);
  });
  if(S.traits.franchise)sc+=200; /* 神主牌:忠誠加成 */
  return {sc,mvp,aceN,king};
}
export function tierOf(bucket){
  const st=S.stats[bucket]; if(!st)return null;
  const hs=honorScore(bucket);
  const sc=careerScore(st)+hs.sc,th=TIER_TH[bucket];
  let i=sc>=th[0]?0:sc>=th[1]?1:sc>=th[2]?2:sc>=th[3]?3:4;
  /* 獎項保底:MVP/最高投手獎至少明星球員;單項王至少每日球員 */
  if(hs.mvp||hs.aceN)i=Math.min(i,1);
  else if(hs.king)i=Math.min(i,2);
  return {i,sc:Math.round(sc),name:LG_N[bucket]+['名人堂','明星球員','每日球員','邊緣球員','一頁過客'][i]};
}
export function statTable(bucket){
  const st=S.stats[bucket]; if(!st)return '';
  let rows;
  if(S.pos==='P'){
    const era=st.IP>0?baseballERA(st).toFixed(2):'-';
    const whip=st.IP>0?baseballWHIP(st).toFixed(2):'-';
    rows=`<tr><th>Yrs</th><th>G</th><th>IP</th><th>W</th><th>L</th><th>SV</th><th>HLD</th><th>SO</th><th>BB</th><th>ERA</th><th>WHIP</th></tr>
    <tr><td>${st.yr}</td><td>${st.G}</td><td>${fmtIP(st.IP)}</td><td>${st.W}</td><td>${st.L}</td><td>${st.SV||0}</td><td>${st.HLD||0}</td><td>${st.SO}</td><td>${st.BB||0}</td><td>${era}</td><td>${whip}</td></tr>`;
  }else{
    const obpN = st.PA>0 ? (st.H+st.BB)/st.PA : 0;
    const slgN = slgOf(st);
    const avg = st.AB>0 ? (st.H/st.AB).toFixed(3).replace(/^0/,'') : '-';
    const obp = st.PA>0 ? obpN.toFixed(3).replace(/^0/,'') : '-';
    const slg = st.AB>0 ? slgN.toFixed(3).replace(/^0/,'') : '-';
    const ops = st.AB>0 ? (obpN+slgN).toFixed(3).replace(/^0/,'') : '-';
    rows=`<tr><th>Yrs</th><th>G</th><th>PA</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th><th>H</th><th>HR</th><th>RBI</th><th>SB</th><th>DEF</th></tr>
    <tr><td>${st.yr}</td><td>${st.G}</td><td>${st.PA}</td><td>${avg}</td><td>${obp}</td><td>${slg}</td><td>${ops}</td><td>${st.H}</td><td>${st.HR}</td><td>${st.RBI}</td><td>${st.SB}</td><td>${st.DEF>0?'+':''}${st.DEF||0}</td></tr>`;
  }
  const asN=st.AS||0;
  return `<p style="margin-top:8px"><b>${LG_N[bucket]}</b>${asN?` · 明星賽 ${asN} 度入選`:''}</p><table class="fin">${rows}</table>`;
}
export function milestoneLevel(st,key,unit){ return Math.floor((st&&st[key]||0)/unit)*unit; }
export function milestoneLine(label,st,defs,onlyKeys){
  if(!st)return '';
  const parts=[];
  defs.forEach(([key,unit,suffix])=>{
    if(onlyKeys&&!onlyKeys.has(key))return;
    const value=milestoneLevel(st,key,unit); if(value)parts.push(`${value}${suffix}`);
  });
  return parts.length?`${label} ${parts.join('・')}`:'';
}
export function careerMilestones(){
  const out=[];
  (S.hofInfo||[]).forEach(h=>out.push(`${h.lg}名人堂｜第 ${h.yr} 年入選｜得票率 ${h.pct}%`));
  const leagues=['MLB','NPB','CPBL'];
  const defs=S.pos==='P'?MILESTONE_DEF.pit:MILESTONE_DEF.bat;
  const played=leagues.filter(b=>{const st=S.stats[b];return st&&((st.yr||0)>0||(st.G||0)>0||(st.PA||0)>0||(st.IP||0)>0);});
  const sum={}; defs.forEach(([key])=>sum[key]=0);
  played.forEach(b=>defs.forEach(([key])=>sum[key]+=S.stats[b][key]||0));
  /* 通算只在兩聯盟以上且加總真的跨過任何單一聯盟的下一級里程碑時，額外列出該項；各聯盟紀錄仍全部保留。 */
  if(played.length>=2){
    const raised=new Set();
    defs.forEach(([key,unit])=>{
      const combined=milestoneLevel(sum,key,unit);
      const best=Math.max(0,...played.map(b=>milestoneLevel(S.stats[b],key,unit)));
      if(combined>best)raised.add(key);
    });
    const total=milestoneLine('通算',sum,defs,raised); if(total)out.push(total);
  }
  leagues.forEach(b=>{const m=milestoneLine(LG_N[b],S.stats[b],defs);if(m)out.push(m);});
  return out;
}
export function honorRank(awd){
  const intl=/經典賽|12強|奧運|亞運|國家隊/.test(awd);
  const league=intl?0:(/大聯盟|世界大賽/.test(awd)?1:(/日職|日本一/.test(awd)?2:(/中職/.test(awd)?3:4)));
  const kind=/總冠軍|世界大賽冠軍|日本一$/.test(awd)?0:/年度MVP/.test(awd)?1:/MVP/.test(awd)?2:
    /最佳投手|賽揚/.test(awd)?3:/金手套/.test(awd)?4:/守備聖經/.test(awd)?5:/王/.test(awd)?6:/明星賽/.test(awd)?8:7;
  return league*10+kind;
}
export function honorGroups(){
  const map=new Map();
  S.honors.forEach(h=>{ const parts=h.split(' '), yr=parts.length>=2?parts.shift():''; const awd=parts.length?parts.join(' '):h;
    if(!map.has(awd))map.set(awd,[]); map.get(awd).push(yr); });
  return [...map].map(([awd,yrs])=>({awd,yrs})).sort((a,b)=>honorRank(a.awd)-honorRank(b.awd)||a.awd.localeCompare(b.awd,'zh-Hant'));
}
export function yearRanges(yrs){
  const nums=yrs.filter(Boolean).map(Number).sort((a,b)=>a-b); if(!nums.length)return [];
  const res=[]; let st=nums[0],ed=nums[0];
  for(let i=1;i<=nums.length;i++){
    if(i<nums.length&&nums[i]===ed+1)ed=nums[i];
    else{res.push(ed-st>=2?`${st}~${ed}`:ed-st===1?`${st}、${ed}`:`${st}`);if(i<nums.length){st=nums[i];ed=nums[i];}}
  }
  return res;
}
export function honorText(g){
  const ranges=yearRanges(g.yrs), count=g.yrs.length;
  if(!ranges.length)return g.awd;
  return count>1?`${g.awd} ×${count} (${ranges.join('、')})`:`${g.awd} (${ranges[0]})`;
}
