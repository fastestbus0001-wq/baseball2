import {S} from '../core/state.js?v=1.5.0';
import {$, teamChip} from './dom.js?v=1.5.0';
import {TRAIT_KEYS, TRAIT_N, TRAIT_FX, legendTraitNames} from '../data/traits.js?v=1.5.0';
import {TEAM_COLOR, teamNick} from '../data/teams.js?v=1.5.0';

export function traitNames(k){
  if(k==='legend'){
    return legendTraitNames(S.legendLeagues,S.legendLeague); /* legendLeague 供舊狀態相容 */
  }
  return [traitName(k)];
}
export function traitName(k){
  if(k==='mrteam')return (teamNick(S.mrTeamName||'')||'')+'先生';
  if(k==='legend')return traitNames(k)[0]||'歷史級球星';
  if(k==='rainbow')return (S.rainbowLg||'')+'七彩球衣';
  return TRAIT_N[k]||k; }
export function traitTagStyle(k){
  if(TRAIT_KEYS.neg.includes(k))return 'background:#2a0f0f;border-color:#c0392b;color:#ff8b7a'; /* 負向:紅 */
  if(k==='legend'||k==='taiwan')return 'background:#3a2c05;border-color:#ffc95c;color:#ffe08a'; /* 歷史級/挺台灣:金 */
  if(k==='goldcloth')return 'background:#3a3505;border-color:#e8d43a;color:#fff35a'; /* 黃金聖衣:黃 */
  if(k==='mrteam'){ const c=teamChip(TEAM_COLOR[S.mrTeamName]||'#ffc95c'); return 'background:'+c.bg+';border-color:'+c.bd+';color:'+c.fg; }
  if(k==='genius')return 'background:#232733;border-color:#c8d0e0;color:#e8eef7'; /* 天才:銀 */
  return ''; /* 正向:預設琥珀 */ }
export function renderTraits(){ /* desktop trait side panel (presentation only) */
  const el=$('trait-tags'),box=$('trait-side'); if(!el||!box)return;
  let h='';
  if(S&&S.traits){
    /* one row per trait: tag + inline effect text (ellipsized; full text on hover) */
    const row=(style,name,fx)=>`<div class="trow" title="${fx}"><span class="tag" style="${style}" title="${fx}">${name}</span><span class="td">${fx}</span></div>`;
    [...TRAIT_KEYS.pos,...TRAIT_KEYS.neg].forEach(k=>{ if(S.traits[k])traitNames(k).forEach(name=>{ h+=row(traitTagStyle(k),name,TRAIT_FX[k]||''); }); });
    (S.removed||[]).forEach(l=>h+=`<div class="trow"><span class="tag" style="text-decoration:line-through;opacity:.4;color:#8a8a8a;border-color:#4a4a4a">${l}</span><span class="td" style="opacity:.4">已解除</span></div>`);
  }
  el.innerHTML=h;
  box.classList.toggle('empty',!h); }
