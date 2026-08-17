import {S} from '../core/state.js?v=1.5.0';
import {R, pick, chance, clamp} from '../core/rng.js?v=1.5.0';
import {ABL, POS_AB} from '../data/abilities.js?v=1.5.0';
import {LV} from '../data/teams.js?v=1.5.0';
import {EVENTS, EVENT_CATEGORY_NAMES, EVENT_COMBINATIONS} from '../data/events.js?v=1.5.0';
import {card, choose, board} from '../ui/dom.js?v=1.5.0';
import {addAb, ovr} from '../engine/ability.js?v=1.5.0';
import {majorChampionshipCount} from '../engine/championship.js?v=1.5.0';
export function traitCard(key,name,desc,tone){ S.traits[key]=true;
  card(tone||'gold','隱藏屬性解鎖：'+name,desc); board(0); }
export function removeTrait(key,label){ if(S.traits[key]){ S.traits[key]=false;
    if(!S.removed.includes(label))S.removed.push(label); } }
export function checkChampionTrait(){
  const count=majorChampionshipCount(S.honors);
  if(!S.traits.championmaker&&count>=5){
    traitCard('championmaker','優勝請負人','你是掌握勝利的神，只要擁有你，球隊奪冠機率大增。國家隊與職業隊奪冠率提升5%。');
    return true;
  }
  return false;
}
export function evOdds(){ /* 事件卡成功率:顯示與擲骰共用同一來源 */
  let base=(S.traits.genius||S.traits.late||S.traits.clutch)?70:50; /* 天才/大器晚成/大心臟 70 */
  if(S.traits.thief)base-=10; /* 薪水小倫 -10 */
  const boldPen=S.traits.clutch?0:15; /* 大心臟:豪賭無懲罰 */
  return {safe:Math.min(95,base+20), norm:base, bold:base-boldPen};
}
export function eventEligible(ev,state){
  const s=state||S;
  if(ev.maxAge!==undefined&&s.age>ev.maxAge)return false;
  if(ev.role==='P'&&s.pos!=='P')return false;
  if(ev.role==='C'&&s.pos!=='C')return false;
  if(ev.role==='B'&&(s.pos==='P'||s.pos==='C'))return false;
  if(ev.scope!=='*'&&s.org!==ev.scope)return false;
  if(ev.times.includes('ALL'))return true;
  if(s.stage==='PRO')return ev.times.includes(LV[s.lv]&&LV[s.lv].top?'PRO':'MINOR');
  return ev.times.includes(s.stage);
}
export function eventPool(category,state){ return EVENTS.filter(ev=>ev.category===category&&eventEligible(ev,state)); }
function shuffled(list){ const out=list.slice(); for(let i=out.length-1;i>0;i--){ const j=Math.floor(R()*(i+1)); [out[i],out[j]]=[out[j],out[i]]; } return out; }
export function availableEventCombinations(state){
  return EVENT_COMBINATIONS.filter(combo=>combo.every(category=>eventPool(category,state).length));
}
const isDoubleTraining=combo=>combo[0]==='training'&&combo[1]==='training';
export function eventCombinationOptions(state){
  const pool=shuffled(availableEventCombinations(state));
  const chosen=pool.slice(0,3);
  if(chosen.length===3&&!chosen.some(isDoubleTraining)){
    const required=pool.filter(isDoubleTraining);
    if(required.length)chosen[2]=pick(required);
  }
  return shuffled(chosen);
}
function eventTarget(ev){ return ev.target in S.ab?ev.target:pick(POS_AB[S.pos]); }
function targetLabel(ev){ return ev.target in S.ab?ABL[ev.target]:'隨機主能力'; }
function eventCash(mode){
  const base={CPBL2:5,CPBL1:20,NPB2:10,NPB1:50,R:5,A1:7,A2:10,A3:15,MLB:100}[S.lv]||5;
  const traitBonus=S.traits.adking?1.1:1;
  return Math.max(1,Math.round(base*({bold:1.5,norm:1,safe:.5}[mode]||1)*traitBonus));
}
export function recordOutsideIncome(value){
  const cash=Math.max(0,Math.round(Number(value)||0));
  S.salary=(S.salary||0)+cash;
  S.outsideIncome=(S.outsideIncome||0)+cash;
  S.yearOutsideIncome=(S.yearOutsideIncome||0)+cash;
  return cash;
}
const fmtEventMoney=value=>Number(value).toLocaleString()+'萬';
export function eventPlan(category,mode,good,clutch){
  if(category==='training'){
    const points=mode==='safe'?1:mode==='norm'?(good?1:2):(good?(clutch?3:2):(clutch?2:3));
    return {ability:good?points:-points,stat:0,cash:false};
  }
  if(category==='encounter'){
    const points=mode==='safe'?1:mode==='norm'?2:(clutch?(good?3:2):3);
    return {ability:0,stat:good?points:-points,cash:false};
  }
  if(mode==='safe')return {ability:0,stat:good?1:-1,cash:good};
  if(mode==='norm')return {ability:good?1:0,stat:good?0:-1,cash:good};
  return {ability:good?1:0,stat:good?(clutch?2:1):(clutch?-1:-2),cash:good};
}
function planSummary(ev,mode,good){
  const p=eventPlan(ev.category,mode,good,!!S.traits.clutch), parts=[];
  if(p.cash)parts.push(`業外收入 +${fmtEventMoney(eventCash(mode))}`);
  if(p.ability)parts.push(`${targetLabel(ev)} ${p.ability>0?'成長點 +':'能力值 '}${p.ability>0?p.ability:p.ability}`);
  if(p.stat)parts.push(`本季成績加成 ${p.stat>0?'+':''}${p.stat}`);
  return parts.join('、')||'沒有額外數值變動';
}
function showEvent(ev,after){
  const od=evOdds();
  const opts=[
    ['bold','全力一搏',true,false],
    ['norm','普通應對',false,true],
    ['safe','保守應對',false,false],
  ].map(([mode,subtitle,warn,main])=>{
    const c=ev.choices[mode];
    return {t:c.label,warn,main,center:true,s:`${subtitle}｜成功率 ${od[mode]}%<br>成功：${planSummary(ev,mode,true)}｜失敗：${planSummary(ev,mode,false)}`,f:()=>resolveEvent(ev,mode,after)};
  });
  choose(`事件｜${EVENT_CATEGORY_NAMES[ev.category]}｜${ev.n}<br><small>${ev.intro}</small>`,opts);
}
function runEventSequence(sequence,done,index){
  const i=index||0;
  if(i>=sequence.length){ done(); return; }
  const category=sequence[i],pool=eventPool(category,S);
  const after=()=>{ board(1); runEventSequence(sequence,done,i+1); };
  showEvent(pick(pool.length?pool:EVENTS.filter(ev=>ev.category===category)),after);
}
function runEventCards(cards,done,index){
  const i=index||0;
  if(i>=cards.length){ done(); return; }
  const after=()=>{ board(1); runEventCards(cards,done,i+1); };
  showEvent(cards[i],after);
}
export function amateurEventPool(state){
  const s=state||S;
  return EVENTS.filter(ev=>ev.category!=='endorsement'&&eventEligible(ev,s));
}
export function drawEvents(done){
  /* 高中與大學沒有代言，也不選事件組成：通用卡與該階段限定卡混池後抽兩張。 */
  if(S.stage==='HS'||S.stage==='U'){
    runEventCards(shuffled(amateurEventPool(S)).slice(0,2),done,0);
    return;
  }
  const combos=eventCombinationOptions(S);
  choose('請決定今年的事件組成',combos.map(combo=>({
    t:combo.map(category=>EVENT_CATEGORY_NAMES[category]).join('・'),main:true,
    s:`選定後依序進行：${combo.map(category=>EVENT_CATEGORY_NAMES[category]).join(' → ')}`,
    f:()=>runEventSequence(combo,done,0)
  })));
}
export function resolveEvent(ev,mode,done){
  done=done||function(){};
  const od=evOdds(); /* 與畫面顯示同源,保證所見即所得 */
  if(mode==='safe')S.cntSave++;
  let good,tag;
  if(mode==='safe'){ good=chance(od.safe); tag='保守應對'; }
  else if(mode==='bold'){ good=chance(od.bold); tag='全力一搏';
    if(good){ S.cntBoldWin++; if(ev.category==='endorsement')S.cntEndorseBoldWin=(S.cntEndorseBoldWin||0)+1; }
    else S.cntBoldFail++; }
  else { good=chance(od.norm); tag=''; }
  if(mode==='safe'&&good)S.cntSaveWin=(S.cntSaveWin||0)+1; /* 自律狂:保守成功才算 */
  if((ev.n==='宵夜文化'||ev.n==='場外代言邀約')&&mode!=='safe'&&!good)S.cntSnack++;
  if(mode==='bold'&&!good&&(ev.category==='encounter'||ev.category==='endorsement'))S.cntSocialBoldFail=(S.cntSocialBoldFail||0)+1;
  const plan=eventPlan(ev.category,mode,good,!!S.traits.clutch), out=[];
  if(plan.cash){ const cash=recordOutsideIncome(eventCash(mode));
    out.push(`業外收入 <span class="up">+${fmtEventMoney(cash)}</span>`); }
  if(plan.ability){
    const k=eventTarget(ev),before=S.ab[k],delta=addAb(k,plan.ability);
    if(plan.ability>0&&delta===0&&before<80)out.push(`${ABL[k]}：能力加點，但不足以提升一級`);
    else if(plan.ability>0&&before>=80)out.push(`${ABL[k]} 已達上限`);
    else out.push(`${ABL[k]} <span class="${delta>=0?'up':'dn'}">${delta>0?'+':''}${delta}</span>`);
  }
  if(plan.stat){ S.pendStat=(S.pendStat||0)+plan.stat; out.push(`本季成績加成 <span class="${plan.stat>0?'up':'dn'}">${plan.stat>0?'+':''}${plan.stat}</span>`); }
  const result=ev.choices[mode];
  const resultText=good?result.good:result.bad;
  card(good?'good':'bad','事件卡｜'+ev.n+(tag?`（${tag}）`:''),
    `${resultText}${/[。！？!?]$/.test(resultText)?'':'。'}${mode==='bold'&&good?'<b class="hl">全力一搏成功！</b>':''}${mode==='bold'&&!good?'<b class="dn">全力一搏失敗……</b>':''}<br>${out.join('｜')||'沒有額外數值變動'}`);
  checkTraitsMid();
  done();
}
/* 賽季中即時可解鎖的特性 */
export function allocDone(touched,isDice){
  const keys=Object.keys(touched);
  if(isDice&&S.stage!=='HS'&&keys.length){ /* 只計職業/大學季初骰的專注度 */
    const tot=Object.values(touched).reduce((a,b)=>a+b,0);
    let mk=keys[0]; keys.forEach(k=>{ if(touched[k]>touched[mk])mk=k; });
    const focused=(touched[mk]/tot>=0.75)?mk:null; /* 七成五以上灌同一項 */
    if(focused&&focused===S.samePickKey)S.samePick++;
    else if(focused){ S.samePickKey=focused; S.samePick=1; }
    else { S.samePickKey=null; S.samePick=0; }
    if(S.samePick>=3&&!S.traits.combo){ S.traits.combo=true; S.samePickBonus=true;
      S.comboKey=S.samePickKey; /* 鎖定解鎖當下的能力,之後不再變動 */
      traitCard('combo','大巧不工',`連續三年，你把所有汗水都澆在同一個工具上——<b class="hl">季初系統會自動擲 1 顆骰，永遠加在你專精的「${ABL[S.comboKey]}」上</b>。專精者的複利。`); }
  }
  /* 大器晚成:25 歲後單季加點總幅度 >=8 */
  const gain=Object.values(touched).reduce((a,b)=>a+b,0);
  if(!S.traits.late&&!S.traits.genius&&ovr()<47&&S.age>=25&&S.age<32&&isDice&&gain>=16){
    S.traits.late=true;
    const exDef=S.pos==='C'?['rng','fld','arm','cat']:[];
    const cands=POS_AB[S.pos].filter(k=>S.ab[k]<70&&!exDef.includes(k));
    for(let i=cands.length-1;i>0;i--){const j=Math.floor(R()*(i+1));const t=cands[i];cands[i]=cands[j];cands[j]=t;}
    const boost=cands.slice(0,2), bl=[];
    boost.forEach(k=>{ S.pot[k]=Math.min(80,(S.pot[k]||62)+10); S.ab[k]=clamp(S.ab[k]+5,1,80);
      bl.push(`${ABL[k]} <b class="up">+5</b>（潛力上限 +10 → ${S.pot[k]}）`); });
    card('gold','隱藏素質解鎖：大器晚成',`別人都以為你到頂了，你卻在這一年脫胎換骨——從今以後，每一顆訓練骰<b class="hl">永久固定 3 點以上</b>，事件卡好結果機率提升至 <b class="hl">70%</b>。`+(bl.length?`潛能重新被評估：${bl.join('、')}。`:'')+'你的故事，才正要展開。');
    board(1); }
}
export function checkTraitsMid(){
  if(!S.traits.adking&&(S.cntEndorseBoldWin||0)>=5){
    traitCard('adking','業配王','你在廣告上的時間，比明星還多，從此代言取得金額多10%'); }
  /* 自律狂:25 歲前累積保守「成功」15 次 + 從未外遇被抓 + 宵夜 <5 次 */
  if(!S.traits.disc&&S.age<25&&(S.cntSaveWin||0)>=15&&S.love.caught===0&&S.cntSnack<5){
    traitCard('disc','自律狂','你見過凌晨四點的洛杉磯嗎？——年紀輕輕就把身體當成聖殿經營，沒有派對、沒有酒精，只有重訓室的鐵片聲：<b class="hl">整條衰退曲線延後兩年</b>，你的巔峰比同梯更長。'); }
  /* 大心臟:25 歲前全力一搏成功 7 次(允許失敗) */
  if(!S.traits.clutch&&S.age<25&&S.cntBoldWin>=7){
    traitCard('clutch','大心臟','每次的豪賭淬鍊出你無與無比的心性，愈刺激的狀況只會讓你更加幹勁十足。從此以後，愈賭愈強，成功獎勵愈大，失敗懲罰愈少，不過在豪賭的路上，還是要注意一下身邊的其他人……<br><b class="hl">「全力一搏」成功率提升至天才級；訓練成功加成 +3、失敗只 −2；遭遇與代言也會減輕失敗懲罰；國際賽個人成績獲得小幅加成</b>。'); }
  /* 外務纏身:宵夜/代言/緋聞累計(以宵夜次數 + 感情事件觸發次數估) */
  if(!S.traits.distract&&!S.traits.disc&&(S.love.affairs+S.love.caught+S.cntSnack)>=4&&(S.love.affairs+S.love.caught)>=1){
    traitCard('distract','外務纏身','通告、代言、社群媒體佔據了你太多心神，休賽季很久沒有完整專注在棒球上——<b class="dn">季初擲骰永久 −1 顆</b>（最低 2 顆）。','bad'); }
  /* 更衣室毒瘤:遭遇＋代言的全力一搏失敗合計超過 10 次；渣男仍保留既有解鎖路徑。 */
  if(!S.traits.cancer&&!S.traits.franchise&&!S.traits.intlace&&((S.cntSocialBoldFail||0)>10||S.traits.scum)){
    traitCard('cancer','更衣室毒瘤','教練受夠了你的不可控，隊友對你的新聞指指點點。比起成績，球團現在更想清理休息室的氣氛——<b class="dn">季末被交易機率大增、續約條件惡化</b>。','bad'); }
}
