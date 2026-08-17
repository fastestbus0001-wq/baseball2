import {S, blankStat, bucketOf, nextStep, stageLabel} from '../core/state.js?v=1.5.0';
import {R, ri, chance, clamp, N0} from '../core/rng.js?v=1.5.0';
import {POS_ADJ_RUNS} from '../data/abilities.js?v=1.5.0';
import {LV, HS_CUPS, U_CUPS} from '../data/teams.js?v=1.5.0';
import {card, board} from '../ui/dom.js?v=1.5.0';
import {ovr, careerAllStars, toolGap} from './ability.js?v=1.5.0';
import {tjAccrue, tjGamble} from './injury.js?v=1.5.0';
/* temporary scaffold until awards/intl/contract/flow are extracted */
import {demotionAudit} from './contract.js?v=1.5.0';
import {awards} from './awards.js?v=1.5.0';
import {maybeIntl} from './intl.js?v=1.5.0';
import {traitCard, removeTrait} from '../flow/events.js?v=1.5.0';
export function pitcherRole(){ /* 體力 >=52 先發;否則牛棚,牛棚內看表現升終結者 */
  if(S.ab.sta>=52)return 'SP';
  /* 牛棚:讀「上一季」的 d(prevD,因為 lastD 已被 phasePre 清空);頂尖 → 終結者 */
  const pd=(S.prevD!==undefined?S.prevD:(S.lastD||0));
  /* 只有上一季已在相同頂級聯盟投牛棚，該季成績才可用於終結者升降。
     二軍升一軍、跨聯盟或舊存檔缺少 lastLv 時，第一季一律先從中繼開始。 */
  const currentTop=LV[S.lv]&&LV[S.lv].top, previousTop=LV[S.lastLv]&&LV[S.lastLv].top;
  const sameTopLeague=!!currentTop&&previousTop===currentTop;
  const d=(sameTopLeague&&S.role&&S.role!=='SP')?pd:-99;
  if(S.role==='CL')return d>=1?'CL':'MR';   /* 終結者崩盤才降中繼 */
  return d>=3?'CL':'MR';                     /* 中繼打出頂尖成績升終結者 */
}
export function outsFromIP(ip){ /* 模擬用十進位局數統一量化為實際出局數 */
  return Math.max(0,Math.round((Number(ip)||0)*3));
}
export function ipFromOuts(outs){
  return Math.max(0,Math.round(Number(outs)||0))/3;
}
export function normalizeIP(ip){
  return ipFromOuts(outsFromIP(ip));
}
export function baseballERA(st){
  const ip=normalizeIP(st&&st.IP);
  return ip>0?(Number(st&&st.ER)||0)*9/ip:null;
}
export function baseballWHIP(st){
  const ip=normalizeIP(st&&st.IP);
  return ip>0?((Number(st&&st.H)||0)+(Number(st&&st.BB)||0))/ip:null;
}
export function fmtIP(ip){ /* 以出局數顯示棒球局數：1/3 局=.1、2/3 局=.2 */
  const outs=outsFromIP(ip);
  return Math.floor(outs/3)+'.'+(outs%3);
}
export function roleN(r){ return {SP:'先發',MR:'中繼',CL:'終結者'}[r]||'—'; }
export function isSP(){ return S.role==='SP'; } /* 先發引擎判定 */
/* ================= 數據模擬 ================= */
export function scaledSteals(fullSeason,pa,leagueGames){
  return Math.round(Math.max(0,fullSeason||0)*clamp((pa||0)/((leagueGames||1)*4.25),0,1));
}
export function capSteals(st){
  const timesOnBase=Math.max(0,(st.H||0)+(st.BB||0));
  const physicalCap=Math.min(Math.floor((st.PA||0)*0.35),Math.floor(timesOnBase*1.5));
  st.SB=Math.max(0,Math.min(Math.round(st.SB||0),physicalCap));
}
export function simSeason(lv){
  if(S.pos==='P'&&!S.role)S.role=pitcherRole();
  const L=LV[lv], par=L.par, a=S.ab, f=S.seasonFactor;
  const st={G:0,PA:0,AB:0,H:0,HR:0,RBI:0,SB:0,BB:0,W:0,L:0,SV:0,IP:0,SO:0,ER:0,avg:0,era:0,d:0};
  if(f<=0) return st;
  if(S.pos==='P'){
    const q=(a.vel+a.ctl+a.brk)/3, d=q-par; st.d=d;
    /* 表現係數:投得好給滿局數,投爛減少出賽(比照野手) */
    const perfF=clamp(0.80+d*0.028,0.42,1.12);
    if(isSP()){
      const gs=Math.round(clamp(20+(a.sta-40)*0.18,10,30)*f*perfF*(0.94+R()*0.08));
      st.G=Math.max(1,gs);
      /* IP/GS:聯盟平均~5.0、優質先發5.2-6.0、工作馬6.1-6.5;由 d 值(綜合實力)決定,控球差略減 */
      const ipg=clamp(5.0+d*0.05+(a.sta-50)*0.012+(a.ctl-par)*0.006+N0(0.12),4.8,6.5);
      st.IP=+(st.G*ipg).toFixed(1);
    }else{
      st.G=Math.max(1,Math.round(clamp(45+(Math.min(a.sta,60)-40)*0.3,25,68)*f*perfF*(0.94+R()*0.08))); /* 高體力後援:出賽數貢獻以 sta60 封頂,不會貼近先發工作量 */
      st.IP=+(st.G*1.05).toFixed(1);
    }
    st.era=clamp(4.32-d*0.17+N0(0.35),1.40,9.90);
    st.ER=Math.round(st.era*st.IP/9);
    const k9=clamp(6.2+(a.vel-par)*0.11+(a.brk-par)*0.06+N0(0.5),3.5,13.5);
    st.SO=Math.round(st.IP/9*k9);
    /* 保送:控球決定(BB/9);被安打:d 值決定;WHIP=(H+BB)/IP */
    const bb9=clamp(4.6-(a.ctl-par)*0.13+N0(0.4),1.2,7.5);
    st.BB=Math.round(st.IP/9*bb9);
    const h9=clamp(9.2-d*0.16+N0(0.5),5.0,13.5);
    st.H=Math.round(st.IP/9*h9);
    st.WHIP=st.IP>0?+(baseballWHIP(st)||0).toFixed(2):0;
    if(isSP()){
      const dec=Math.round(st.G*0.72), wp=clamp(0.50+d*0.014+N0(0.05),0.15,0.85);
      st.W=Math.round(dec*wp); st.L=dec-st.W;
    }else if(S.role==='CL'){
      /* 終結者:救援以出賽數為基礎(轉化率隨表現 d),SV 天生 <= G;每場最多 1 救援 */
      const svRate=clamp(0.55+d*0.02,0.35,0.82);            /* 救援轉化率:35%~82% */
      st.SV=Math.min(st.G, Math.round(st.G*svRate));         /* 不可超過出賽數 */
      st.HLD=Math.min(Math.max(0,st.G-st.SV), Math.round(st.G*0.12)); /* 非救援登板的中繼 */
      const dec=Math.max(1,Math.round(st.G*0.14)); st.W=Math.round(dec*clamp(0.45+d*0.02,0.3,0.7)); st.L=Math.max(0,dec-st.W);
    }else{ /* 中繼:中繼成功 HLD 以出賽數為基礎 */
      const hldRate=clamp(0.45+d*0.02,0.25,0.72);
      st.HLD=Math.min(st.G, Math.round(st.G*hldRate));       /* 不可超過出賽數 */
      st.SV=Math.min(Math.max(0,st.G-st.HLD), chance(25)?ri(1,5):0);
      const dec=Math.max(1,Math.round(st.G*0.14)); st.W=Math.round(dec*clamp(0.5+d*0.015,0.35,0.7)); st.L=Math.max(0,dec-st.W);
    }
    /* 物理約束:每場最多一種結果 → 救援占比<=85%、勝+敗+救援+中繼 總和不可超過出賽數 */
    if(!isSP()){
      st.SV=Math.min(st.SV||0, Math.floor(st.G*0.85));
      st.HLD=Math.min(st.HLD||0, Math.max(0,st.G-st.SV));
      const decCap=Math.max(0,st.G-st.SV-st.HLD);
      if((st.W+st.L)>decCap){ st.W=Math.min(st.W,decCap); st.L=Math.max(0,decCap-st.W); }
    }
  }else{
    const q=a.con*0.5+a.pow*0.2+a.eye*0.18+a.spd*0.12, d=q-par-0.5; st.d=d; /* 加入 pow(長打產能計入實力);-0.5 校準,整體分布與舊版對齊 */
    /* 出賽規模:體力設上限,表現(d)決定實際多寡 */
    /* 體力係數:50+ 接近滿(~0.9-1.0)、45~50 尚可、40 明顯少、35 只剩代打量(~0.35) */
    let staF;
    if(a.sta>=55)staF=1.0; else if(a.sta>=50)staF=0.90+(a.sta-50)*0.02;
    else if(a.sta>=45)staF=0.72+(a.sta-45)*0.036; else if(a.sta>=40)staF=0.52+(a.sta-40)*0.04;
    else if(a.sta>=35)staF=0.35+(a.sta-35)*0.034; else staF=Math.max(0.15,0.35-(35-a.sta)*0.03);
    /* B. 明星級強打(d>=10)但體力撐不住守備(staF<0.75) → 該季轉 DH,只站打擊區,staF 拉到 0.9 下限 */
    let dhThisYear=false;
    if(d>=10 && staF<0.75 && S.dpos!=='DH' && S.dpos!=='C'){
      staF=Math.max(staF,0.9); dhThisYear=true;
    }
    /* 表現係數:打得好才有滿打席,爛表現(d<0)出賽再打折 */
    const perfF=clamp(0.82+d*0.03,0.45,1.12);
    st.G=Math.min(L.g, Math.round(L.g*clamp(staF*perfF,0.10,1.0)*f*(0.95+R()*0.06))); /* 上限=聯盟場次,不可超過 */
    st.PA=Math.round(st.G*4.25);
    st._dh=dhThisYear; /* 供 accStat 記 DH 年 */
    st.BB=Math.round(st.PA*clamp(0.062+(a.eye-par)*0.0034,0.045,0.17));
    st.AB=st.PA-st.BB;
    st.avg=clamp(0.252+d*0.0058+(a.sta-50)*0.0003+(a.spd-par)*0.0006+N0(0.014),0.140,0.380);
    st.H=Math.round(st.AB*st.avg); st.avg=st.AB?st.H/st.AB:0;
    st.HR=Math.round(st.AB*clamp(0.010+(a.pow-par)*0.0022,0.001,0.075)*(0.85+R()*0.3));
    const fullSeasonSB=clamp((a.spd-45)*0.5+(a.spd-par)*1.3+N0(4),0,70);
    st.SB=scaledSteals(fullSeasonSB,st.PA,L.g); /* 盜壘依實際打席機會縮放，不能只打十幾場卻跑出完整球季產量。 */
    st.RBI=Math.round(st.HR*2.1+(st.H-st.HR)*0.30);
    /* DEF 會在所有出賽加成套用完後，依最終實際出賽數統一計算。 */
    st.DEF=0;
  }
  applySeasonForm(st,lv);   /* 低潮年/生涯年:調整率值與產出(不動出賽數) */
  if(S.pos!=='P')capSteals(st);
  return st;
}
/* 賽季狀態:10% 低潮(成績×0.65)、10% 生涯年(成績×1.2,需健康);倍率只作用產出/率值,出賽數 G 不變 */
export function applySeasonForm(st,lv){
  if(S.seasonFactor<=0)return;                 /* 傷缺全季不觸發 */
  st.form=0;                                    /* 0=正常 1=生涯年 -1=低潮 */
  const roll=R();
  const canCareer=S.seasonFactor>=0.9;          /* 生涯年需該季健康 */
  let m=1;
  if(roll<0.10){ st.form=-1; m=0.65; }          /* 低潮:成績打 65 折 */
  else if(canCareer && roll<0.20){ st.form=1; m=1.20; } /* 生涯年:成績 ×1.2 */
  if(m===1)return;
  if(S.pos==='P'){
    /* 投手:三振/勝場隨倍率;被安打與自責分反向(生涯年變少、低潮變多);SV/HLD 依倍率但不超過出賽數 */
    st.SO=Math.round(st.SO*m);
    st.W=Math.round(st.W*m); if(st.L!=null)st.L=Math.max(0,Math.round(st.L/(m||1)));
    st.H=Math.max(0,Math.round(st.H/m)); st.ER=Math.max(0,Math.round(st.ER/m));
    st.era=st.IP>0?+(baseballERA(st)||0).toFixed(2):st.era;
    st.WHIP=st.IP>0?+(baseballWHIP(st)||0).toFixed(2):st.WHIP;
    if(st.SV)st.SV=Math.min(st.G,Math.round(st.SV*m));
    if(st.HLD)st.HLD=Math.min(Math.max(0,st.G-(st.SV||0)),Math.round(st.HLD*m));
    /* 物理約束(倍率後再夾):救援占比<=85%、勝+敗+救援+中繼 <= 出賽數 */
    if(!isSP()){
      st.SV=Math.min(st.SV||0, Math.floor(st.G*0.85));
      st.HLD=Math.min(st.HLD||0, Math.max(0,st.G-st.SV));
      const decCap=Math.max(0,st.G-st.SV-st.HLD);
      if((st.W+st.L)>decCap){ st.W=Math.min(st.W,decCap); st.L=Math.max(0,decCap-st.W); }
    }
  }else{
    /* 打者:安打/全壘打/盜壘/打點隨倍率;打席與出賽數不變(打率連帶變動) */
    st.H=Math.round(st.H*m); st.HR=Math.round(st.HR*m); st.SB=Math.round(st.SB*m);
    if(st.H>st.AB)st.H=st.AB;                   /* 安打不可超過打數 */
    st.avg=st.AB?st.H/st.AB:0;
    st.RBI=Math.round(st.HR*2.1+(st.H-st.HR)*0.30);
  }
  /* d 值(影響評價/獎項/下放)跟著狀態調整 */
  st.d += st.form===1?4:st.form===-1?-4:0;
}
/* 守備分(近似 defensive runs):守位難度權重 × 守備工具相對聯盟基準的幅度 × 出賽比重 */
export function defRuns(lv,overrideDp,games){
  if(S.pos==='P')return 0;
  const L=LV[lv],a=S.ab,par=L.par;
  const dp=overrideDp||S.dpos||(S.pos==='C'?'C':'2B');
  if(dp==='DH')return 0; /* DH 不產生守備分 */
  const posW={SS:1.25,CF:1.20,C:1.15,'2B':1.05,'3B':1.00,RF:0.95,'1B':0.75,LF:0.80}[dp]||1;
  const skill=dp==='C'?(a.fld*0.4+a.arm*0.3+a.cat*0.3)
    :(a.rng*0.45+a.fld*0.40+a.arm*0.15);
  const gw=clamp((games||0)/(L.g||1),0,1);
  return Math.round((skill-par)*posW*0.55*gw);
}
/* 舊年度尚未保存角色時，以數據推定；新年度直接使用 st.role。 */
export function pitcherSalaryRole(st,recordedRole){
  if(['SP','MR','CL'].includes(recordedRole))return recordedRole;
  if(st&&['SP','MR','CL'].includes(st.role))return st.role;
  if(st&&(st.SV||0)>=10&&(st.SV||0)>=(st.HLD||0))return 'CL';
  if(st&&(st.HLD||0)>=10)return 'MR';
  if(st&&(st.G||0)>0&&(st.IP||0)/(st.G||1)>=2.5)return 'SP';
  return S.role||'SP';
}
/* 薪資專用球員價值：野手計打擊、守備與守位；投手計球威、角色與實際工作量。 */
export function seasonSalaryRating(st,lv,recordedRoleOrPos){
  if(!st||!Number.isFinite(st.d))return 0;
  if(Number.isFinite(st.payD))return st.payD;
  if(S.pos==='P'){
    if(!(st.G>0))return st.d; /* 全年復健只交由傷後市場折價，不重複扣工作量。 */
    const role=pitcherSalaryRole(st,recordedRoleOrPos), L=LV[lv]||LV[S.lv];
    let adj=0;
    if(role==='SP')adj=clamp(((st.IP||0)/(L.g||1)-0.75)*2,-1,0.75);
    else if(role==='CL')adj=-2+clamp(((st.SV||0)-25)/20,-0.75,0.75);
    else adj=-4+clamp(((st.HLD||0)-20)/20,-0.75,0.75);
    return +(st.d+adj).toFixed(2);
  }
  const dp=st._dh?'DH':(recordedRoleOrPos||S.dpos||(S.pos==='C'?'C':'DH'));
  const games=Math.max(0,Number(st.G)||0), def=dp==='DH'?0:(Number(st.DEF)||0);
  const posRuns=(POS_ADJ_RUNS[dp]||0)*(games/162);
  return +(st.d+(def+posRuns)/6).toFixed(2);
}
export function currentSalaryRating(fallback){
  if(Number.isFinite(S.lastPayD))return S.lastPayD;
  if(S.lastSt)return seasonSalaryRating(S.lastSt,S.lastLv||S.lv,S.pos==='P'?S.role:S.dpos);
  return Number.isFinite(fallback)?fallback:0;
}
/* 所有球季狀態與特質加成結束後，再做一次聯盟場次與棒球物理限制的統一校正。 */
export function normalizeBatterStats(st,lv){
  const maxG=LV[lv].g||0;
  st.G=clamp(Math.round(st.G||0),0,maxG);
  const maxPA=Math.round(st.G*4.75);
  st.PA=clamp(Math.round(st.PA||0),0,maxPA);
  st.BB=clamp(Math.round(st.BB||0),0,st.PA);
  st.AB=clamp(Math.round(st.AB||0),0,Math.max(0,st.PA-st.BB));
  st.H=clamp(Math.round(st.H||0),0,st.AB);
  st.HR=clamp(Math.round(st.HR||0),0,st.H);
  st.RBI=Math.max(0,Math.round(st.RBI||0));
  capSteals(st);
  st.avg=st.AB>0?st.H/st.AB:0;
}
export function normalizePitchingStats(st,lv){
  const maxG=LV[lv].g||0;
  st.G=clamp(Math.round(st.G||0),0,maxG);
  st.IP=normalizeIP(clamp(Number(st.IP)||0,0,st.G*9));
  ['H','BB','SO','ER','W','L','SV','HLD'].forEach(k=>st[k]=Math.max(0,Math.round(st[k]||0)));
  if(isSP()){
    st.SV=0; st.HLD=0;
    const decCap=st.G;
    if(st.W+st.L>decCap){
      const ratio=decCap/(st.W+st.L||1);
      st.W=Math.floor(st.W*ratio); st.L=Math.min(decCap-st.W,Math.floor(st.L*ratio));
    }
  }else{
    st.SV=Math.min(st.SV,Math.floor(st.G*0.85));
    st.HLD=Math.min(st.HLD,Math.max(0,st.G-st.SV));
    const decCap=Math.max(0,st.G-st.SV-st.HLD);
    if(st.W+st.L>decCap){
      const ratio=decCap/(st.W+st.L||1);
      st.W=Math.floor(st.W*ratio); st.L=Math.min(decCap-st.W,Math.floor(st.L*ratio));
    }
  }
  st.era=st.IP>0?+(baseballERA(st)||0).toFixed(2):0;
  st.WHIP=st.IP>0?+(baseballWHIP(st)||0).toFixed(2):0;
}
export function accStat(bucket,st){
  if(!S.stats[bucket]) S.stats[bucket]=blankStat();
  const t=S.stats[bucket]; t.yr++;
  if(bucket!=='MINOR'&&S.orgTeam){ const tb=S.teamTally[bucket]||(S.teamTally[bucket]={});
    tb[S.orgTeam]=(tb[S.orgTeam]||0)+1; }
  if(S.pos!=='P'){ const dp=(st&&st._dh)?'DH':(S.dpos||'—');
    S.dposYears[dp]=(S.dposYears[dp]||0)+1;
    if(!t.DPG)t.DPG={}; t.DPG[dp]=(t.DPG[dp]||0)+(st.G||0); }
  else if(S.role){ S.roleYears[S.role]=(S.roleYears[S.role]||0)+1; }
  ['G','PA','AB','H','HR','RBI','SB','BB','W','L','SV','HLD','SO','ER'].forEach(k=>t[k]+=(st[k]||0));
  t.DEF+=(st.DEF||0);
  t.IP=ipFromOuts(outsFromIP(t.IP)+outsFromIP(st.IP));
}
export function statLine(st){
  if(S.pos==='P'){ const role=roleN(S.role); const relief=(S.role==='CL'&&st.SV)?`｜${st.SV}救援`:(S.role==='MR'&&st.HLD)?`｜${st.HLD}中繼`:''; return `出賽 ${st.G}｜局數 ${fmtIP(st.IP)}｜${st.W}勝${st.L}敗${relief}｜三振 ${st.SO}｜保送 ${st.BB||0}｜ERA ${st.era.toFixed(2)}｜WHIP ${(st.WHIP||0).toFixed(2)}`; }
  const obpN=st.PA>0?(st.H+st.BB)/st.PA:0;
  const slgN=slgOf(st);
  const obp=st.PA>0?obpN.toFixed(3).replace(/^0/,''):'-';
  const slg=st.AB>0?slgN.toFixed(3).replace(/^0/,''):'-';
  const ops=st.AB>0?(obpN+slgN).toFixed(3).replace(/^0/,''):'-';
  return `出賽 ${st.G}｜打席 ${st.PA}｜打擊率 ${st.avg.toFixed(3).replace(/^0/,'')}｜上壘率 ${obp}｜長打率 ${slg}｜OPS ${ops}｜安打 ${st.H}｜全壘打 ${st.HR}｜打點 ${st.RBI}｜保送 ${st.BB}｜盜壘 ${st.SB}${st.DEF!==undefined?`｜守備 ${st.DEF>0?'+':''}${st.DEF}`:''}`;
}
/* 長打率估算:無二三壘數據,依全壘打比例與力量推估壘打數 */
export function slgOf(st){
  if(!st.AB)return 0;
  const hr=st.HR, nonHR=Math.max(0,st.H-hr);
  /* 非全壘打安打中,約 22% 二壘打、3% 三壘打——取整數支數,壘打數必為整數,小樣本 SLG 才不會出現 .320 這種不可能的值 */
  const doubles=Math.round(nonHR*0.22), triples=Math.round(nonHR*0.03);
  const singles=Math.max(0,nonHR-doubles-triples);
  const tb=singles + doubles*2 + triples*3 + hr*4;
  return tb/st.AB;
}
export function amateurSeason(){
  if(S.seasonFactor===0){ card('bad','','整季只能在場邊看著隊友比賽。');
    S.log.push({y:S.year,age:S.age,tm:S.team||stageLabel(),line:'傷缺全季', inj:true}); nextStep(); return; }
  const cups=S.stage==='HS'?HS_CUPS:S.stage==='U'?U_CUPS:['成棒甲組春季聯賽','成棒甲組秋季聯賽'];
  const thr=S.stage==='HS'?[52,46,40,34,28]:[60,54,48,42,36];
  let gain=0,lines=[],plain=[];
  const eventForm=S.pendStat||0;
  const tB=S.stage==='HS'?({1:6,2:0,3:-6})[S.hsTier||2]:0; /* 高中隱藏強度分級 */
  cups.forEach(c=>{ const pw=ovr()+tB+eventForm+ri(-8,8);
    const i=pw>=thr[0]?0:pw>=thr[1]?1:pw>=thr[2]?2:pw>=thr[3]?3:pw>=thr[4]?4:5;
    const rk=['冠軍','亞軍','四強','八強','十六強','預賽出局'][i];
    const pts=[7,5,4,3,2,1][i]+Math.floor(ovr()/22);
    gain+=pts; lines.push(`${c}：<b class="hl">${rk}</b>（+${pts} 點）`); plain.push(`${c}${rk}`);
    if(S.stage==='U'&&rk==='冠軍'&&!S.traits.academy){ S.traits.academy=true;
      card('gold','隱藏屬性解鎖：學院派','大學殿堂的科學化訓練與防護打下扎實基礎——<b class="hl">25 歲前受傷率 −5%、季初擲骰期望值提升</b>。'); }
    if(i===0){
      S.honors.push(`${S.year} ${c}冠軍`);
      if(S.stage==='HS')S.hsChampions=(S.hsChampions||0)+1;
    } });
  if(S.stage==='HS'&&(S.hsChampions||0)>3&&!S.traits.miraclegen){
    traitCard('miraclegen','奇蹟世代','沒有人知道這所學校的這群少年，會在棒球界中掀起什麼樣的風暴');
  }
  S.pendStat=0;
  S.pool+=gain;
  S.log.push({y:S.year,age:S.age,tm:S.team||stageLabel(),line:plain.join('、'), inj:false});
  card('','年度大賽',lines.join('<br>')+`<div class="statline">獲得能力點 ${gain} 點，季末統一分配。能力越高，大賽收穫越多。</div>`);
  maybeIntl(()=>nextStep());
}
export function proSeason(){
 const seasonLv=S.lv,st=simSeason(seasonLv); S.lastSt=st; S.lastD=st.d; S.lastLv=seasonLv;
  if(S.pendStat!==0&&S.seasonFactor>0){
    /* 【修正】狀態火燙的加成，必須依照該季實際出賽的比例（seasonFactor）進行打折 */
    const p = S.pendStat * S.seasonFactor;
    if(p>0&&S.pos==='P'){
      /* 狀態火燙=教練重用:後援先加出賽(不超過場次上限),再加內容;物理約束重夾 */
      if(!isSP()){ const reliefCap=Math.min(68,LV[seasonLv].g); const addG=Math.min(Math.max(0,reliefCap-st.G),Math.round(p*1.2)); st.G+=addG; st.IP=+(st.IP+addG*1.05).toFixed(1); }
      st.SO+=Math.round(p*8); st.IP=+(st.IP+p*4).toFixed(1);
      if(isSP())st.W+=Math.round(p*0.4); else st.SV+=Math.round(p*0.6);
      st.era=st.IP>0?clamp(st.era-p*0.05,1.40,9.90):st.era; st.ER=Math.round(st.era*st.IP/9);
      if(!isSP()){ /* 救援/勝敗不可超過出賽數(物理約束) */
        st.SV=Math.min(st.SV||0,Math.floor(st.G*0.85));
        st.HLD=Math.min(st.HLD||0,Math.max(0,st.G-st.SV));
        const decCap=Math.max(0,st.G-st.SV-st.HLD);
        if((st.W+st.L)>decCap){ st.W=Math.min(st.W,decCap); st.L=Math.max(0,decCap-st.W); }
      } }
    else if(p>0){ const Lg=LV[S.lv];
      /* 狀態火燙=教練重用:先轉為上場機會(G/PA 連動,不超過聯盟場次),打擊內容同步升溫 */
      const addG=Math.min(Math.max(0,(Lg.g||120)-st.G), Math.round(p*1.5));
      const addPA=Math.round(addG*4.25), addAB=Math.round(addPA*0.9);
      st.G+=addG; st.PA+=addPA; st.AB+=addAB;
      let addH=Math.round(addAB*0.55)+Math.round(p*1.5); /* 新打席打得火燙+原打席手感提升 */
      addH=Math.max(0,Math.min(addH, st.AB-st.H));        /* 安打不可超過打數 */
      const addHR=Math.min(addH, Math.round(p*1.2));
      st.H+=addH; st.HR+=addHR; st.RBI+=Math.round(addHR*2.1+(addH-addHR)*0.3);
      st.avg=st.AB?st.H/st.AB:0; }
    else if(S.pos==='P'){
      const q=Math.abs(p);
      st.SO=Math.max(0,st.SO-Math.round(q*6));
      st.W=Math.max(0,st.W-Math.round(q*.3));
      if(!isSP())st.SV=Math.max(0,(st.SV||0)-Math.round(q*.4));
      st.era=st.IP>0?clamp(st.era+q*.08,1.40,9.90):st.era;
      st.ER=Math.round(st.era*st.IP/9);
    } else {
      const q=Math.abs(p), loseH=Math.min(st.H,Math.round(q*2));
      st.H-=loseH;
      st.HR=Math.min(st.H,Math.max(0,st.HR-Math.round(q*.5)));
      st.RBI=Math.max(0,st.RBI-Math.round(q*1.2));
      st.avg=st.AB?st.H/st.AB:0;
    }
  }
  S.pendStat=0;
  /* 投法對成績的加成/折損 */
  if(S.pos==='P'&&S.seasonFactor>0){ const em={'全力投':1,'普通投':0,'養生球':-1}[S.effort]||0;
    if(em!==0){ st.d+=em; st.era=clamp(st.era-em*0.25,1.40,9.90); st.ER=Math.round(st.era*st.IP/9);
      st.SO=Math.round(st.SO*(1+em*0.06)); } }
  if(S.traits.onetool&&S.seasonFactor>0){ /* 工具人:那項工具讓他「多爭取」到代打/代跑/代守上場(加成,非砍半) */
    const boost=1.25; /* 工具帶來的額外上場機會 */
    ['G','PA','AB'].forEach(k=>{ if(typeof st[k]==='number')st[k]=Math.round(st[k]*boost); });
    /* 累積型數據隨打席等比微調 */
    ['H','HR','RBI','SB','BB'].forEach(k=>{ if(typeof st[k]==='number')st[k]=Math.round(st[k]*boost); });
    st.avg=st.AB>0?st.H/st.AB:0; capSteals(st); }
  if(S.pos==='P')normalizePitchingStats(st,seasonLv);
  else{
    normalizeBatterStats(st,seasonLv);
    st.DEF=defRuns(seasonLv,st._dh?'DH':null,st.G);
  }
  S.lastD=st.d;
  if(S.pos==='P')st.role=S.role;
  st.payD=seasonSalaryRating(st,seasonLv,S.pos==='P'?S.role:S.dpos);
  S.lastPayD=st.payD;
  const bucket=bucketOf(S.lv); accStat(bucket,st);
  /* The position actually played this season, not the registered one: a forced-DH year
     (the dhThisYear branch above) already counts as DH for defensive runs, dposYears,
     salary rating and award eligibility, so every display reads it from here too. */
  const seasonDp=st._dh?'DH':(S.dpos||'');
  if(S.seasonFactor===0){ card('bad','球季數據','（傷缺，本季無出賽紀錄）'); }
  else card('','球季數據',`<span class="tag">${S.teamName()}${seasonDp?'｜'+seasonDp:''}</span><div class="statline">${statLine(st)}</div>`);
  /* 低潮年 / 生涯年 敘述卡 */
  if(st.form===-1){
    card('bad','巨大的低潮',`身體狀況很好，但是成績一直打不出來，遇到了巨大的低潮。孤獨、無助，就像是溺水一樣，只能隨意抓取孤木。`);
  }else if(st.form===1){
    if(S.pos==='P') card('gold','生涯年','縫線掠過指尖的感覺無與倫比，而你投出去的球像是有了生命，用一個無人能想像得到的角度，閃過了打者的球棒，並穩穩投進捕手的手套。');
    else card('gold','生涯年','投來的每顆球看起來都像籃球一樣大，你看得到縫線、球的轉動，就和駭客任務的子彈一樣慢了下來，而你每一顆擊中甜蜜點的球，都往全壘打牆奔去。');
  }
  const isInj = S.seasonFactor <= 0.45; /* 判斷是否為大傷報廢年 */
  S.log.push({y:S.year,age:S.age,tm:S.teamName(),lv:seasonLv,p:seasonDp,role:S.pos==='P'?S.role:null,line:S.seasonFactor===0?'傷缺全季':statLine(st), inj: isInj, st: st});
  /* 鐵人累計 */
  const healthy=S.seasonFactor>=0.95&&(S.pos==='P'?(isSP()?st.IP>=120:st.G>=42):st.G>=LV[S.lv].g*0.8);
  if(healthy){ S.ironStreak++;
    if(S.ironStreak>=5&&!S.traits.iron){ S.traits.iron=true;
      card('gold','隱藏素質解鎖：鐵人','連續五年全勤級出賽！你就像是八點檔，無論哪一年打開電視，都能看到你在球場奮戰，球迷們甚至開始懷疑你是機器人，未來每季受傷機率<b class="hl">不高於 10%</b>。'); } }
  else if(S.seasonFactor<0.95)S.ironStreak=0;
  /* 只會這個:先看夠不夠格當主力,夠格絕不判工具人;不夠格才看有無突出工具 */
  if(S.pos!=='P'){ const tg=toolGap();
    /* 主力判定:還原健康狀態下的預估出賽數,傷病缺陣不影響評估
       (出賽數公式含 seasonFactor,除回即得健康時的預估;表現係數仍保留) */
    const projG = S.seasonFactor > 0 ? (st.G / S.seasonFactor) : 0;
    const isRegular = projG >= LV[S.lv].g * 0.60;
    if(!S.traits.onetool && !isRegular && tg.gap>=22 && tg.val>=58 && careerAllStars()<4){ S.traits.onetool=true;
      const wasBefore=S.removed.includes('只會這個');
      S.removed=S.removed.filter(x=>x!=='只會這個'); /* 重新觸發:清掉刪除線記錄 */
      const role=tg.role;
      S.toolRole=role;
      if(wasBefore||S.age>=33)
        traitCard('onetool','只會這個',`歲月帶走了你的其他工具，只剩<b class="hl">${role}</b>那一項本領還在。教練把你當成板凳上的秘密武器——關鍵時刻，你仍然可靠。`,'bad');
      else
        traitCard('onetool','只會這個',`你只有一項武器強得誇張，其餘全是破洞。教練不敢讓你先發，只在關鍵時刻派你上去做一件事——你成了球隊的<b class="hl">${role}</b>。出賽數銳減，但那一項本領無人能及。`,'bad'); }
    else if(S.traits.onetool && (tg.gap<18 || isRegular)){ /* 補起來 或 實力打回主力 → 解除 */
      removeTrait('onetool','只會這個'); S.toolRole=null;
      card('good','不再是工具人','教練終於敢把你放進先發打線——你證明了自己不只是板凳上的一招鮮。<b class="hl">「只會這個」解除</b>，你是個完整的球員了。'); board(1); } }
  awards(bucket,st);
  if(S.pos==='P'&&S.seasonFactor>0)tjAccrue(st,seasonLv);
  tjGamble(()=>demotionAudit(()=>maybeIntl(()=>nextStep())));
}
export function roleName3(r){ return {SP:'先發投手',MR:'中繼投手',CL:'終結者'}[r]||'投手'; }
