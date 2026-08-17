import {S, stepQ, nextStep, stageLabel} from '../core/state.js?v=1.5.0';
import {R, ri, chance, clamp} from '../core/rng.js?v=1.5.0';
import {ABL, POS_AB} from '../data/abilities.js?v=1.5.0';
import {LV, PATHS, teamNick} from '../data/teams.js?v=1.5.0';
import {AMA_ANNUAL} from '../data/economy.js?v=1.5.0';
import {card, choose, board, divider} from '../ui/dom.js?v=1.5.0';
import {tlNote, tlPush, tlRestage} from '../ui/timeline.js?v=1.5.0';
import {allocUI} from '../ui/alloc.js?v=1.5.0';
import {addAb, ovr, dposReview} from '../engine/ability.js?v=1.5.0';
import {rollInjury, tjCap} from '../engine/injury.js?v=1.5.0';
import {isMrTeamEligible} from '../engine/tenure.js?v=1.5.0';
import {amateurSeason, proSeason, slgOf, currentSalaryRating, baseballERA, baseballWHIP} from '../engine/season.js?v=1.5.0';
import {championshipChance} from '../engine/championship.js?v=1.5.0';
import {buyoutRemaining, contractAnnual, contractMarketProfile, controlledAnnual, crossOffers, daibaFarewell, extensionOffer, faFlow, fmtMoney, handleDemotion, levelMinAnnual, makeContract, makeOffers, offseasonTradeCheck, pickOfferUI, signTo, teamChampRate} from '../engine/contract.js?v=1.5.0';
import {drawEvents, removeTrait, checkChampionTrait} from './events.js?v=1.5.0';
import {loveEvent} from './love.js?v=1.5.0';
import {runDraft, pathChoiceHS, pathChoiceU4, advance} from '../engine/draft.js?v=1.5.0';
import {endGame} from '../ui/retire.js?v=1.5.0';
/* ================= 年度流程 ================= */
export function startYear(){ S.yearOutsideIncome=0; stepQ.length=0; stepQ.push(phasePre,phaseMid,phaseEnd); divider(`${S.year} 年 · ${S.age} 歲 · ${stageLabel()}`); tlPush(); nextStep(); }
/* ---------- 季初 ---------- */
export function phasePre(){
  board(0); S.tmpInj=0; S.seasonFactor=1; S.skipMid=false; S.marketInjury='healthy'; S.prevD=S.lastD||0; S.lastD=0; S.lastPayD=0; /* 先保留上季 d 供投手定位判定 */
  checkChampionTrait(); /* 舊存檔已有五冠時也會補解鎖。 */
  if(S.age>=48){ buyoutRemaining(1,true); endGame('身體已到極限，'+S.year+' 年春訓後宣布引退。'); return; }
  const declAge=S.age-(S.traits.disc?2:0); /* 自律狂:衰退曲線整體延後兩年 */
  if(declAge>=32){ const baseDec=declAge>=35?5+(declAge-35):2;
    const oldGhostActive=!!(S.oldGhostPending&&!S.oldGhostUsed);
    const dec=oldGhostActive?Math.max(1,Math.round(baseDec*0.5)):baseDec;
    POS_AB[S.pos].forEach(k=>S.ab[k]=clamp(S.ab[k]-dec,1,80));
    if(oldGhostActive){ S.oldGhostPending=false; S.oldGhostUsed=true; }
    card('bad','歲月不饒人',`${declAge>=35?'第二階段（逐年加劇）':'第一階段'}衰退：所有能力 <b class="dn">−${dec}</b>${S.traits.disc?'（自律狂：生涯延後兩年）':''}${oldGhostActive?`（老鬼：原衰退 −${baseDec}，本年減緩 50%）`:''}。訓練加點照常，但身體回不去了。`); board(0); }
  if(S.rehab>0){ S.rehab--; S.skipMid=true; S.seasonFactor=0; S.marketInjury='rehab';
    card('bad','復健年',`大傷尚未痊癒，本季確定<b class="dn">全年報銷</b>，只能在復健室度過。（擲骰減為 2 顆）`);
    const dummySt = {G:0,PA:0,AB:0,H:0,HR:0,RBI:0,SB:0,BB:0,W:0,L:0,SV:0,HLD:0,IP:0,SO:0,ER:0,avg:0,era:0,WHIP:0,DEF:0};
    S.log.push({y:S.year,age:S.age,tm:S.stage==='PRO'?S.teamName():(S.team||stageLabel()),line:'復健年・全年報銷', inj: true, st: S.stage==='PRO'?dummySt:null}); }
  let afterAsk=()=>{
    let n=S.skipMid?2:(()=>{const r=R();return r<0.35?3:r<0.75?4:r<0.95?5:6;})();
    if(S.traits.distract&&!S.skipMid)n=Math.max(2,n-1); /* 外務纏身 */
    if(S.traits.academy&&!S.skipMid&&chance(35))n++; /* 學院派:期望值略升 */
    
    const dice=[]; let newSix=0;
    for(let i=0;i<n;i++){ const v=S.traits.genius?ri(4,6):S.traits.late?ri(3,6):ri(1,6); dice.push(v);
      if(v===6&&S.age<22&&!S.traits.genius){S.six++;newSix++;} }
      
    let msg=`自主訓練擲出 <b class="hl">${n}</b> 顆骰。`;
    if(newSix&&!S.traits.genius)msg+=` 高標值「6」累計 <b class="hl">${S.six}/5</b> 次。`;
    
    /* 【修正】大巧不工改為：自動擲骰並加點，滿額溢出轉為成績加成 */
    if(S.traits.combo && !S.skipMid && (S.comboKey||S.samePickKey)) {
      const ck = S.comboKey||S.samePickKey; /* 永遠用解鎖當下鎖定的能力 */
      const cv = S.traits.genius?ri(4,6):S.traits.late?ri(3,6):ri(1,6);
      const gained = addAb(ck, cv);
      const overflow = S.lastOverflow || 0;

      if(overflow > 0) S.pendStat = (S.pendStat || 0) + overflow;

      let cmsg = `<br>大巧不工發動：系統自動擲出 <b class="hl">${cv}</b> 點，挹注於 <b class="hl">${ABL[ck]}</b>`;
      if(gained > 0) cmsg += `（能力 <b class="up">+${gained}</b>）`;
      if(overflow > 0) cmsg += `（頂峰造極：溢出的 ${overflow} 點轉為<b class="up">本季成績加成</b>）`;
      if(gained===0 && overflow===0) cmsg += `（能力加點，但不足以提升一級）`;
      msg += cmsg + `。`;
    }
    
    card('','季初特訓',msg);
    if(S.six>=5&&!S.traits.genius&&S.age<22){ S.traits.genius=true;
      {
      const exDef=S.pos==='C'?['rng','fld','arm','cat']:[];
      const cands=POS_AB[S.pos].filter(k=>S.ab[k]<70&&!exDef.includes(k));
      for(let i=cands.length-1;i>0;i--){const j=Math.floor(R()*(i+1));const t=cands[i];cands[i]=cands[j];cands[j]=t;}
      const boost=cands.slice(0,2), bl=[];
      boost.forEach(k=>{ S.pot[k]=Math.min(80,(S.pot[k]||62)+10);
        S.ab[k]=clamp(S.ab[k]+5,1,80); bl.push(`${ABL[k]} <b class="up">+5</b>（潛力上限 +10 → ${S.pot[k]}）`); });
      card('gold','隱藏素質解鎖：天才','22 歲前五度擲出高標值！從今以後，每一顆訓練骰<b class="hl">永久固定 4 點以上</b>，事件卡好結果機率提升至 <b class="hl">70%</b>。'+(bl.length?`天賦覺醒，潛能重新被評估：${bl.join('、')}。`:'')+'天賦，是藏不住的。');
      board(1);
    } }
    choose('',[{t:`▸ 分配訓練成果（${dice.length} 顆骰）`,main:true,f:()=>dposReview(()=>allocUI({dice},'分配訓練成果（點骰套用｜球探量表：'+(S.pos==='P'?'60/70/75':'70/75')+' 以上成長遞減）',()=>nextStep()))}]);
  };
  /* 投手開季：投球強度(續航+TJ 量表) */
  const preAsk=afterAsk;
  if(S.pos==='P'&&S.stage==='PRO'&&!S.skipMid){
    afterAsk=()=>{
      choose(`開季投球規劃（手臂狀況：${(function(){const r=S.tj/tjCap();return S.rehab>0?'復健中':r>=0.85?'手肘隱隱作痛':r>=0.6?'手臂略感疲勞':r>=0.35?'狀況尚可':'手感輕盈';})()}）`,[
        {t:'全力投',warn:true,s:'成績最佳｜手臂負荷最大（TJ 累積 ×1.30）',f:()=>{S.effort='全力投';preAsk();}},
        {t:'普通投',main:true,s:'標準強度｜TJ 累積正常',f:()=>{S.effort='普通投';preAsk();}},
        {t:'養生球',s:'成績保守｜省手臂（TJ 累積 ×0.80）',f:()=>{S.effort='養生球';preAsk();}}]);
    };
  }
  /* 大學季前：是否投入選秀與旅外（大二～大四） */
  if(S.stage==='U'&&S.stageYr>=2){
    const o=ovr();
    const opts=[
      {t:'投入中華職棒選秀',s:`目前綜合 ${o}｜年齡加權：越年輕評價越高`,f:()=>runDraft(true,afterAsk)},
      {t:'留在大學繼續磨練',main:true,f:afterAsk}
    ];
    /* 年齡懲罰：每長一歲，門檻微調，但簽約金大幅縮水 */
    const agePenalty = Math.max(0, S.age - 18);
    const reqNPB = 44 + Math.floor(agePenalty / 2);   // 門檻：18歲44 -> 22歲46
    const reqMiLB = 50 + Math.floor(agePenalty / 2);  // 門檻：18歲50 -> 22歲52
    const bonusNPB = Math.max(100, 800 - agePenalty * 180);   // 日職簽約金逐年大減
    const bonusMiLB = Math.max(150, 1500 - agePenalty * 350); // 美職簽約金逐年大減
    /* the season was already pushed as a college year; tlRestage() moves it to the new
       league so a short overseas stint still shows up as its own era on the career card */
    const goPro=()=>{ tlRestage(); afterAsk(); };
    if(o>=reqNPB)opts.push({t:'洽談旅日合約',s:`休學挑戰日職｜大齡影響簽約金`,f:()=>{
      S.stage='PRO'; S.team=''; S.svc=0; S.faElig=false;
      pickOfferUI('日職球團報價','NPB',makeOffers('NPB',2,bonusNPB,2,3,'NPB2',null),goPro);}});
    if(o>=reqMiLB)opts.push({t:'洽談旅美合約',s:`休學挑戰小聯盟｜大齡影響簽約金`,f:()=>{
      S.stage='PRO'; S.team=''; S.svc=0; S.faElig=false;
      pickOfferUI('大聯盟球團報價','MiLB',makeOffers('MiLB',2,bonusMiLB,3,4,o>=55?'A1':'R',null),goPro);}});
    choose(`大${['一','二','三','四'][S.stageYr-1]}季前 · 升學與職棒的十字路口`,opts);
    return;
  }
  if(S.stage==='PRO'&&S.age>=36&&S.rehab===0){
    const oldOpts=[{t:'再戰一年',main:true,f:afterAsk}];
    /* 旅外老將(衰退期):放棄現有合約,落葉歸根返台;ovr<30(真的打不動)不給 */
    if(S.org!=='CPBL'&&ovr()>=LV.CPBL2.min){
      oldOpts.push({t:'放棄合約，落葉歸根',s:'狀態不再，仍想把最後的球打給家鄉看',f:()=>{
        card('good','落葉歸根',`狀態雖然已經不在巔峰，但家鄉球隊仍然向你招手——他們要的不是你的實力，是你在國際賽、在海外聯賽建立起的回憶。你決定放棄合約，回家，把職業生涯最後幾年奉獻給大家。`);
        signTo('CPBL','CPBL1'); tlRestage(); afterAsk(); /* spring move: this season is already CPBL */
      }});
    }
    oldOpts.push({t:'召開引退記者會',warn:true,s:'結束選手生涯',f:()=>{buyoutRemaining(0.7,true);daibaFarewell(()=>endGame('功成身退，於 '+S.year+' 年宣布引退。'));}});
    choose('又是一年春訓，身體大不如前了',oldOpts);
    return;
  }
  afterAsk();
}
/* ---------- 賽季中 ---------- */
export function phaseMid(){
  board(1);
  if(S.skipMid){ S.ironStreak=0; nextStep(); return; }
  loveEvent(()=>drawEvents(()=>{
    choose('',[{t:'▸ 季中健康檢查',main:true,f:()=>{ rollInjury();
      choose('',[{t:'▸ 查看球季表現',main:true,f:()=>{
        if(S.stage==='PRO')proSeason();
        else amateurSeason(); }}]); }}]);
  }));
}
/* 球隊年資在季末交易前結算：交易屬於下一季異動，剛打完的球季必須記在原隊。 */
export function updateTeamTenureTraits(){
  if(S.stage!=='PRO'||!S.orgTeam)return;
  S.teamSeasons=(S.teamSeasons||0)+1; /* 同一球團全部球季：二軍、復健年也算忠誠年資。 */
  if(LV[S.lv].top&&!S.skipMid)S.teamYears=(S.teamYears||0)+1; /* 全年復健算球團年資，但不算實際頂級球季。 */

  if(!S.traits.goldcloth&&S.orgTeam==='台中猛獁'&&(S.teamTally.CPBL&&S.teamTally.CPBL['台中猛獁']>=10)){
    S.traits.goldcloth=true;
    card('gold','隱藏屬性解鎖：黃金聖衣','效力 台中猛獁 滿十年，你愛猛獁，不離不棄。'); board(1);
  }

  if(!S.traits.franchise&&S.teamYears>=7&&S.champThisTeam&&S.champTeam===S.orgTeam){
    const removedCancer=!!S.traits.cancer;
    if(removedCancer)removeTrait('cancer','更衣室毒瘤');
    S.traits.franchise=true; S.franchiseActive=true; S.franchiseTeamName=S.orgTeam;
    card('gold','隱藏屬性解鎖：神主牌','小孩指著你說：「我媽媽從小就看你打球」。球團高層很清楚，放你走球迷會把主場拆了——<b class="hl">合約市場保有 4% 招牌球星溢價，並提高引退評價</b>。'+(removedCancer?'<br><b class="hl">你以長年貢獻重新贏回休息室信任，「更衣室毒瘤」解除。</b>':'')); board(1);
  }else if(S.traits.franchise&&!S.franchiseActive&&S.teamYears>=7){
    S.franchiseActive=true; S.franchiseTeamName=S.orgTeam;
    card('gold','神主牌效果恢復',`來到 <b class="hl">${S.orgTeam}</b> 的第七個頂級球季，你再一次成為城市無法割捨的招牌——<b class="hl">交易保護與 4% 合約溢價重新生效</b>。`); board(1);
  }

  /* ◯◯先生：同隊至少 15 季，且其中至少 2/3 是頂級聯盟球季。 */
  const mrEligible=isMrTeamEligible(S.teamSeasons,S.teamYears);
  if(!S.traits.mrteam&&mrEligible){ S.traits.mrteam=true; S.mrTeamName=S.orgTeam;
    const nick=teamNick(S.orgTeam);
    card('gold','隱藏稱號：'+nick+'先生',`在同一支球隊走過 <b class="hl">${S.teamSeasons}</b> 個球季，其中 <b class="hl">${S.teamYears}</b> 季站在頂級舞台。球迷不再喊你的名字，他們喊你「<b class="hl">${nick}先生</b>」——你就是這支球隊的代名詞。`); board(1);
  }

  /* ◯◯七彩球衣：同一聯盟生涯效力球隊數超標（中職>3、日職>5、美職>5）。 */
  if(!S.traits.rainbow){
    const RB={CPBL:['中職',3],NPB:['日職',5],MLB:['大聯盟',5]};
    for(const lg in RB){
      const n=Object.keys((S.teamTally&&S.teamTally[lg])||{}).length;
      if(n>RB[lg][1]){ S.traits.rainbow=true; S.rainbowLg=RB[lg][0];
        card('info','隱藏稱號：'+RB[lg][0]+'七彩球衣',`打開衣櫃，${n} 件不同的球衣掛在眼前——${RB[lg][0]}的球隊你快穿過一輪了。球迷笑稱你是「<b class="hl">七彩球衣</b>」：去到哪裡都能活下來，這也是一種本事。`); board(1); break; }
    }
  }
}
/* ---------- 季末 ---------- */
export function phaseEnd(){
  board(2);
  const outside=Math.round(S.yearOutsideIncome||0);
  const outsideText=outside?`<br>業外收入：<b class="hl">+${fmtMoney(outside)}</b>`:'';
  if(S.stage==='PRO'){
    if(!S.ct)S.ct=makeContract(1,1,S.lv,currentSalaryRating(S.lastD||0));
    const sal=contractAnnual(); /* 合約保證年薪：不因本季表現、受傷或能力變動而重算 */
    S.salary+=sal;
    let extra='';
    if(LV[S.lv].top&&S.seasonFactor>0){
      const tp=LV[S.lv].top;
      const pc=teamChampRate(S.orgTeam,S.year);
      let pcc=pc;
      if(S.tradeRefuse>0){ pcc*=0.75; } /* 否決交易:戰力略受影響(成本已降) */
      pcc=championshipChance(pcc,!!S.traits.championmaker);
      if(chance(pcc)){ const cN={CPBL:'中職總冠軍',NPB:'日本一',MLB:'世界大賽冠軍'}[LV[S.lv].top];
        S.honors.push(`${S.year} ${cN}`); S.wonChamp=true; S.champThisTeam=true; S.champTeam=S.orgTeam; checkChampionTrait(); extra=`<br>球隊奪下 <b class="hl">${cN}</b>，全城陷入瘋狂！`; } }
    if(S.tradeRefuse>0)S.tradeRefuse--;
    if(S.tradeHeat>0)S.tradeHeat=Math.max(0,S.tradeHeat-5);
    card('','季末結算',`本年度薪資：<b class="hl">${fmtMoney(sal)}</b>（生涯累計 ${fmtMoney(Math.round(S.salary))}）${S.ct?`｜合約剩 ${Math.max(0,S.ct.yrs-1)} 年`:''}${outsideText}${extra}`);
    board(2);
  }else if(S.stage==='AMA'){
    S.salary+=AMA_ANNUAL;
    card('','企業隊年度收入',`本年度工作年薪：<b class="hl">${fmtMoney(AMA_ANNUAL)}</b>（每月 4 萬；生涯累計 ${fmtMoney(Math.round(S.salary))}）。有時候你分不清，你是員工，還是球員？${outsideText}`);
    board(2);
  }
  /* 冠軍、薪資與國際賽都結算完畢後，先把本季記在原隊，再進入季末交易。 */
  if(S.stage==='PRO')updateTeamTenureTraits();
  const go=()=>S.stage==='PRO'?offseasonTradeCheck(()=>movement()):movement();
  if(S.pool>0){ const p=S.pool; S.pool=0;
    choose('',[{t:`▸ 分配能力點（${p} 點·大賽／國際賽成果）`,main:true,f:()=>allocUI({pool:p},'季末能力點分配（大賽／國際賽成果）',go)}]); }
  else go();
}
/* ---------- 升降級與去向 ---------- */
export function finishContractYear(o){
  if(!S.ct)S.ct=makeContract(2,1,S.lv,currentSalaryRating(S.lastD||0));
  S.ct.yrs--;
  if(S.ct.annualSchedule&&S.ct.annualSchedule.length)S.ct.annualSchedule.shift();
  /* 母隊延長/換約時機:多年約跑到倒數第二年、或最後一張約剩1年,可談延長 */
  if(S.ct.yrs===1&&LV[S.lv].top&&!S.ct.extOffered&&S.faElig&&(S.lastD||0)>=1&&chance(45)){
    S.ct.extOffered=true; extensionOffer(o); return;
  }
  if(S.ct.yrs<=0){
    if(LV[S.lv].top){
      if(S.faElig){ faFlow(o); return; }
      /* 菜鳥5年內:球團行使續約權,續短約,薪資不低於層級基數 */
      const renewalProfile=contractMarketProfile(S.lastD||0), renewalD=renewalProfile.rating, renewalAnnual=controlledAnnual(S.lv,renewalD,renewalProfile.aav);
      S.ct=makeContract(ri(1,2),1,S.lv,renewalD,renewalAnnual,{extOffered:false,controlled:true});
      card('info','球團續約',`你仍在選秀球隊掌控期（服務 ${S.svc}/5 年），球團依服務年資與近年表現行使續約權——固定年薪 <b class="hl">${fmtMoney(S.ct.annual)}</b> × <b class="hl">${S.ct.yrs} 年</b>，合約總額 <b class="hl">${fmtMoney(S.ct.annual*S.ct.yrs)}</b>。`); board(1);
    } else { S.ct=makeContract(ri(1,2),1,S.lv,currentSalaryRating(S.lastD||0)); } /* 非頂級層級 */
  }
  crossOffers(o);
}
export function movement(){
  const o=ovr();
  if(S.stage==='HS'){ if(S.stageYr<3)advance(); else pathChoiceHS(); return; }
  if(S.stage==='U'){ if(S.stageYr<4)advance(); else pathChoiceU4(); return; }
  if(S.stage==='AMA'){
    if(S.age>=26){ endGame('選秀多年落榜，'+S.year+' 年結束球員身分，轉任基層教練。'); return; }
    choose('業餘年度結束',[
      {t:'再次投入中職選秀',main:true,f:()=>runDraft(false,()=>advance())},
      {t:'高掛球鞋',warn:true,f:()=>endGame('在業餘球隊劃下句點。')}]);
    return;
  }
  /* 職業 */
  if(S.org==='NPB')S.npbYears++;
  if(LV[S.lv].top){ /* 轉換聯盟：直接解除球團 5 年控制期限制，往後只要合約到期就是自由球員 */
    if(S.svcOrg && S.svcOrg!==S.org){ S.faElig=true; }
    S.svcOrg=S.org;
    S.svc=(S.svc||0)+1; if(S.svc>=5)S.faElig=true;
  }
  if(S.skipMid){ finishContractYear(o); return; } /* 復健年不升降級，但照常累積年資、消耗合約年度與處理到期續約。 */
  if(o<30){ buyoutRemaining(1); endGame('能力已跌破中職二軍最低水準，'+S.year+' 年球季後遭釋出，被迫引退。'); return; }
  const path=PATHS[S.org], idx=path.indexOf(S.lv);
  let minReq=LV[S.lv].min;
  if(S.org==='NPB'&&S.npbYears>=8){ minReq-=4; }
  const perf=(S.seasonFactor>=0.5)?(S.lastD||0):null; /* 傷缺季不看成績 */
  /* 得獎保護傘:當季拿過個人獎項(MVP/王/最佳投手,不含明星賽)→絕不下放/釋出 */
  const wonAward = S.honors.some(x=>x.startsWith(String(S.year))&&/王|MVP|賽揚|澤村|最佳投手|金手套|守備聖經/.test(x)&&!/明星賽/.test(x));
  /* Fix C:實際成績達標保護傘——用當季真實數據(不看能力 d),打得好就不下放 */
  let goodReal=false;
  { const st=S.lastSt;
    if(st&&S.seasonFactor>=0.5){
      if(S.pos==='P'){
        const era=baseballERA(st)??99, whip=baseballWHIP(st)??99;
        /* 投手:ERA 或 WHIP 達聯盟一線水準,或有一定救援/中繼產能 */
        if(era<=4.20||whip<=1.35||(st.SV||0)>=15||(st.HLD||0)>=15)goodReal=true;
      }else{
        const obp=st.PA>0?(st.H+st.BB)/st.PA:0, slg=slgOf(st), ops=obp+slg;
        /* 野手:OPS 達聯盟主力水準(.720+),或雙位數轟/盜等實質產能 */
        if(ops>=0.720||st.HR>=12||st.SB>=15||st.RBI>=(LV[S.lv].g>=150?70:55))goodReal=true;
      }
    }
  }
  if(wonAward||goodReal){ /* 拿獎 或 帳面成績達標 → 球團不會處理掉 */ }
  else if(o<minReq){
    if(perf!==null&&perf>=0){ /* 帳面成績夠好,球團續留觀察 */
      card('info','球團評估',`體能檢測數字亮紅燈，但你用<b class="hl">實際成績</b>說話——本季表現達聯盟水準，球團決定續留一線觀察。`);
    }else{ handleDemotion(o,path,idx); return; }
  }else if(perf!==null&&perf<=-6&&chance(55)){ /* 能力還在但成績崩盤,一樣會被下放 */
    card('bad','球團評估','帳面數據遠低於聯盟水準，教練團失去耐心。');
    handleDemotion(o,path,idx); return;
  }
  /* 升級(壓倒性表現可連跳兩級) */
  if(idx<path.length-1){ const nx=path[idx+1];
    if(o>=LV[nx].min&&((S.lastD||0)>=0||chance(50))){
      let to=nx;
      if(idx<path.length-2){ const nx2=path[idx+2];
        if(o>=LV[nx2].min+2&&(S.lastD||0)>=4)to=nx2; }
      const oldAnnual=S.ct?(S.ct.annualSchedule&&S.ct.annualSchedule.length?S.ct.annualSchedule[0]:S.ct.annual):null;
      S.lv=to; card('good','升級通知',`表現獲得肯定，${to!==nx?'<b class="hl">連跳兩級</b>':'晉升'} <b class="hl">${LV[to].n}</b>！`); board(2);
      if(S.ct&&Number.isFinite(oldAnnual)&&levelMinAnnual(to)>oldAnnual){
        const raised=contractAnnual();
        card('info','升級薪資保障',`原合約固定年薪 <b>${fmtMoney(oldAnnual)}</b> 低於 ${LV[to].n}保障標準；自下季起調整為 <b class="hl">${fmtMoney(raised)}</b>，後續即使下放也不會再降回原薪。`);
      }
      if(LV[to].top)tlNote(2,'升上'+LV[to].n);
      if(S.traits.yips){ removeTrait('yips','失憶症'); card('good','走出陰影','將身體與心靈重新來過，終於爬回了原本的高度，——<b class="hl">失憶症痊癒</b>。'); } } }
  finishContractYear(o);
}
