import {S} from '../core/state.js?v=1.5.0';
import {chance, clamp} from '../core/rng.js?v=1.5.0';
import {DPN, GLOVE_TH} from '../data/abilities.js?v=1.5.0';
import {LV} from '../data/teams.js?v=1.5.0';
import {card} from '../ui/dom.js?v=1.5.0';
import {tlNote} from '../ui/timeline.js?v=1.5.0';
import {isSP, slgOf, baseballERA} from './season.js?v=1.5.0';
import {traitCard, removeTrait} from '../flow/events.js?v=1.5.0';
/* 獎項機率同時有硬下限與必得上限；數值越低越好的獎項（ERA）用 lower=true。 */
export function awardP(value,hardLow,autoWin,base=25,lower=false){
  const ineligible=lower?value>hardLow:value<hardLow;
  const automatic=lower?value<=autoWin:value>=autoWin;
  if(ineligible)return 0;
  if(automatic)return 100;
  const progress=lower?(hardLow-value)/(hardLow-autoWin):(value-hardLow)/(autoWin-hardLow);
  return clamp(base+progress*(95-base),base,95);
}
export function rookieAwardGuaranteed(honors,year,leagueName){
  const sameLeagueAwards=honors.filter(x=>x.startsWith(`${year} ${leagueName}`));
  const elite=sameLeagueAwards.some(x=>/年度MVP|最佳投手|賽揚/.test(x));
  const titleCount=sameLeagueAwards.filter(x=>/(三振王|救援王|中繼王|打擊王|全壘打王|盜壘王|打點王|上壘王)$/.test(x)).length;
  return elite||titleCount>=2;
}
export function pitcherAwardName(bucket){
  const leagueName={CPBL:'中職',NPB:'日職',MLB:'大聯盟'}[bucket];
  return `${leagueName}年度最佳投手`;
}
export function relieverAceChance(st,role){
  const era=Number(st&&st.era);
  if(role!=='CL'||!Number.isFinite(era)||st.G<50||era>2.20||(st.SV||0)<35)return 0;
  return clamp(
    3+Math.max(0,2.20-era)*8+Math.max(0,(st.SV||0)-35)*0.4+Math.max(0,(st.d||0)-10)*0.8,
    3,18
  );
}
export function awards(bucket,st){
  if(!LV[S.lv].top||S.seasonFactor===0)return;
  const y=S.year,h=S.honors,lgN={CPBL:'中職',NPB:'日職',MLB:'大聯盟'}[bucket],aceName=pitcherAwardName(bucket);

  /* 符合 simSeason 數學邏輯的門檻表 [必不得獎下限, 必得獎上限] */
  /* 比率數據(ERA/AVG/OBP)與非場次連動數據(SV/HLD/SB)三個聯盟統一標準 */
  /* 只有吃打席/局數的(HR/RBI/SO)依 120:143:162 場次等比放大 */
  const TH = {
    CPBL: { g: 120, era: [3.20, 2.20], sv: [22, 35], hld: [18, 30], so: [130, 180], avg: [0.300, 0.360], hr: [20, 32], rbi: [75, 105], obp: [0.370, 0.430] },
    NPB:  { g: 143, era: [3.20, 2.20], sv: [22, 35], hld: [18, 30], so: [155, 215], avg: [0.300, 0.360], hr: [24, 38], rbi: [90, 125], obp: [0.370, 0.430] },
    MLB:  { g: 162, era: [3.20, 2.20], sv: [22, 35], hld: [18, 30], so: [175, 240], avg: [0.300, 0.360], hr: [27, 43], rbi: [100, 140], obp: [0.370, 0.430] }
  };
  const th = TH[bucket] || TH.CPBL;

  /* 1. 明星賽入選：一般球隊須先達真實成績門檻；台中猛獁可用 30% 人氣票入選。 */
  {
    const d=st.d;
    const popular=bucket==='CPBL'&&S.orgTeam==='台中猛獁';
    const workloadOK=S.pos==='P'
      ? (isSP()?st.IP>=60:st.G>=25)
      : st.PA>=Math.round(LV[S.lv].g*1.7);
    let performanceOK=false;
    if(S.pos==='P'){
      const era=baseballERA(st)??99;
      performanceOK=isSP()
        ? st.IP>=80&&era<=4.00
        : st.G>=30&&era<=3.80&&((st.SV||0)>=10||(st.HLD||0)>=10||d>=2);
    }else{
      const obp=st.PA>0?(st.H+st.BB)/st.PA:0;
      const ops=obp+slgOf(st);
      performanceOK=st.PA>=300&&(st.avg>=0.260||ops>=0.750||st.HR>=15||st.SB>=15);
    }
    let asP=0;
    if(workloadOK){
      if(performanceOK)asP=awardP(d,0,10,10);
      if(popular)asP=performanceOK?clamp(asP+30,30,97):30;
    }
    if(chance(asP)){
      S.stats[bucket].AS++;
      h.push(`${y} ${lgN}明星賽`+(popular&&!performanceOK?'（人氣入選）':''));
    }
  }

  /* 2. 投手個人獎項 */
  if(S.pos==='P'){
    if(isSP() && st.IP >= th.g){
      let p=awardP(st.era,th.era[0],th.era[1],30,true);
      if(p>0&&p<100)p=clamp(p+(st.IP-th.g)*0.35,30,95);
      if(p===100&&st.IP<150)p=95;
      if(chance(p)) h.push(`${y} ${aceName}`);
    }else{
      /* 神級終結者可低機率角逐年度最佳投手；門檻比後援 MVP 更明確，機率上限仍僅 18%。 */
      const p=relieverAceChance(st,S.role);
      if(p>0&&chance(p))h.push(`${y} ${aceName}`);
    }
    if(S.role==='CL'){
      const p=awardP(st.SV,th.sv[0],th.sv[1],28);
      if(chance(p)) h.push(`${y} ${lgN}救援王`);
    }
    if(S.role==='MR'){
      const p=awardP(st.HLD||0,th.hld[0],th.hld[1],28);
      if(chance(p)) h.push(`${y} ${lgN}中繼王`);
    }
    { const p=awardP(st.SO,th.so[0],th.so[1]); if(chance(p))h.push(`${y} ${lgN}三振王`); }
  }
  /* 3. 野手個人獎項 */
  else{
    if(st.PA >= 350){
      const p=awardP(st.avg,th.avg[0],th.avg[1]);
      if(chance(p)) h.push(`${y} ${lgN}打擊王`);
    }
    if(st.PA >= 300){
      const p=awardP(st.HR,th.hr[0],th.hr[1]);
      if(chance(p)) h.push(`${y} ${lgN}全壘打王`);
    }
    if(st.PA >= 300){ // SB不隨場次放大，全聯盟標準一致
      const p=awardP(st.SB,25,45);
      if(chance(p)) h.push(`${y} ${lgN}盜壘王`);
    }
    if(st.PA >= 300){
      const p=awardP(st.RBI,th.rbi[0],th.rbi[1]);
      if(chance(p)) h.push(`${y} ${lgN}打點王`);
    }
    const obp = st.PA > 0 ? (st.H + st.BB) / st.PA : 0;
    if(st.PA >= 350){
      const p=awardP(obp,th.obp[0],th.obp[1]);
      if(chance(p)) h.push(`${y} ${lgN}上壘王`);
    }
    const def1 = st.DEF || 0;
    const awardDp=st._dh?'DH':(S.dpos||(S.pos==='C'?'C':null));
    const gloveMinG=Math.ceil(LV[S.lv].g*0.5);
    if(awardDp&&awardDp!=='DH'&&st.G>=gloveMinG){
      const gt=GLOVE_TH[awardDp]||[4,16];
      const pGlove=awardP(def1,gt[0],gt[1],30);
      if(chance(pGlove))h.push(`${y} ${lgN}${DPN[awardDp]}金手套`);
      const pBible=awardP(def1,9,22,25);
      if(chance(pBible))h.push(`${y} ${lgN}守備聖經`);
    }
  }

  /* 4. 年度 MVP（最高榮譽）：先通過真實成績門檻，再與聯盟其他球員競爭。 */
  const isReliever=S.pos==='P'&&!isSP();
  let mvpQual=false;
  if(S.pos==='P'){
    if(isSP()){
      mvpQual=st.IP>=140&&st.era<=3.20&&(st.W>=12||st.SO>=th.so[0]);
    }else{
      mvpQual=st.G>=50&&st.era<=2.20&&((st.SV||0)>=35||(st.HLD||0)>=30);
    }
  }else{
    const obp=st.PA>0?(st.H+st.BB)/st.PA:0;
    const ops=obp+slgOf(st);
    mvpQual=st.PA>=LV[S.lv].g*3.6&&(
      ops>=0.850||
      st.HR>=th.hr[0]||
      (st.avg>=th.avg[0]&&st.RBI>=th.rbi[0])
    );
  }
  if(mvpQual&&S.seasonFactor>=0.9){
    if(isReliever){
      /* 後援 MVP 保持極低機率，且必須先達神級救援／中繼實績。 */
      const pMVP=clamp(
        0.5+Math.max(0,st.d-10)*0.4+Math.max(0,2.20-st.era)*2+
        Math.max(0,(st.SV||0)-35)*0.08+Math.max(0,(st.HLD||0)-30)*0.04,
        0.5,5
      );
      if(chance(pMVP))h.push(`${y} ${lgN}年度MVP`);
    }else{
      const pMVP=awardP(st.d,8,16,8);
      if(chance(pMVP))h.push(`${y} ${lgN}年度MVP`);
    }
  }

  /* 5. 新人王：一般情況依 d 值抽選；橫掃級新人不會因獨立亂數漏獎。 */
  const rookieOK=bucket!=='CPBL'||!(S.stats.NPB||S.stats.MLB||S.stats.MINOR);
  if(S.stats[bucket].yr===1&&rookieOK){
    const rkP=rookieAwardGuaranteed(h,y,lgN)?100:awardP(st.d,4,10,30);
    if(chance(rkP)) h.push(`${y} ${lgN}新人王`);
  }

  /* 6. 後續獲獎觸發特質 */
  const added=h.filter(x=>x.startsWith(String(y)));
  if(added.length){ card('gold','年度獎項',added.map(x=>x.slice(5)).join('｜'));
    const topAw=added.find(x=>/年度MVP/.test(x))||added.find(x=>/最佳投手|王/.test(x))||added.find(x=>/新人王/.test(x))||added[0];
    tlNote(3,topAw.slice(5));
    if(S.traits.yips){ removeTrait('yips','失憶症'); card('good','走出陰影','站上大舞台拿下獎項的那一刻，腦海裡的雜音消失了——<b class="hl">失憶症痊癒</b>。'); }
    if(S.traits.glass&&!S.traits.phoenix){ const big=added.some(x=>/MVP|最佳投手|打擊王|全壘打王|新人王/.test(x));
      if(big){ S.traits.phoenix=true; removeTrait('glass','玻璃人');
        S.pool+=8;
        card('gold','隱藏屬性解鎖：浴火重生','那些殺不死你的，真的讓你更強大了。受傷的地方逐漸痊癒，長成了更強壯的形狀。——<b class="hl">玻璃人懲罰解除，受傷率恢復正常，並獲得一大筆能力點</b>。'); } }
    const annualMvp=added.some(x=>/年度MVP/.test(x));
    if(annualMvp&&S.age>=35&&!S.traits.oldghost&&!S.oldGhostUsed){
      S.oldGhostPending=true;
      traitCard('oldghost','老鬼','別人正在衰退，而你再一次抵達頂點。時間在你身上彷彿未留下痕跡，球迷們開始叫你老鬼，因為你用成績告訴年輕選手，過去是你的，現在是你的，未來也會是你的。下一年衰退減緩50%。');
    }
    if(annualMvp&&S.age<24&&(bucket==='NPB'||bucket==='MLB')){
      const key=S.pos==='P'?'strongpitch':'stronghit',name=S.pos==='P'?'強投少年':'強打少年';
      if(!S.traits[key])traitCard(key,name,'天空才是你的極限，怪物的成績，不過是你傳奇生涯的起點');
    }
  }
}
