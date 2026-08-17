/* ---------- 能力與守位資料 ---------- */
export const ABL={sta:'體力',vel:'球速',ctl:'控球',brk:'變化球',con:'Contact',pow:'力量',spd:'速度',eye:'選球',rng:'守備範圍',fld:'接球',arm:'臂力',cat:'配球'};
export const POS_AB={P:['sta','vel','ctl','brk'],C:['sta','con','pow','spd','eye','rng','fld','arm','cat'],IF:['sta','con','pow','spd','eye','rng','fld','arm'],OF:['sta','con','pow','spd','eye','rng','fld','arm']};
export const POSN={P:'投手',C:'捕手',IF:'內野手',OF:'外野手'};
/* ---------- 守位系統 ---------- */
export const DPN={SS:'游擊手','2B':'二壘手','3B':'三壘手','1B':'一壘手',
 CF:'中外野手',RF:'右外野手',LF:'左外野手',DH:'指定打擊',C:'捕手'};
/* 每個守位對 範圍/接球/臂力 各有自己的門檻(相對聯盟基準的位移)
   例:三壘不需要游擊等級的範圍,一壘的臂力幾乎不看 */
/* 各守位 × 各聯盟 守備門檻(守備分需 >= 此值才守得動);大聯盟最嚴 */
export const DP_TH={
  C:  {CPBL1:46, NPB1:54, MLB:60},
  SS: {CPBL1:50, NPB1:58, MLB:64},
  CF: {CPBL1:49, NPB1:57, MLB:63},
  '2B':{CPBL1:46,NPB1:53, MLB:59},
  '3B':{CPBL1:44,NPB1:51, MLB:57},
  RF: {CPBL1:43, NPB1:50, MLB:56},
  LF: {CPBL1:41, NPB1:47, MLB:53},
  '1B':{CPBL1:36,NPB1:42, MLB:48}};
export const DP_BAR={CPBL1:45,NPB1:54,MLB:60}; /* 保留給捕手 cOk 等舊判定 */
/* 類 WAR 守位調整（每 162 場的 runs）：薪資與生涯評價共用同一把尺。 */
export const POS_ADJ_RUNS={C:9,SS:7.5,CF:5,'2B':3,'3B':2,RF:-5,LF:-7,'1B':-10,DH:-17.5};
export const DP_RANK={SS:0,CF:0,'2B':1,'3B':2,RF:2,'1B':3,LF:3,DH:4,C:0}; /* 守位身價階層(SS>2B>3B) */
export const GLOVE_TH={C:[4,16],SS:[5,18],'2B':[4,16],'3B':[4,16],CF:[5,18],RF:[3,15],LF:[3,14],'1B':[3,13]};
