import {clamp} from '../core/rng.js?v=1.5.0';

/* 只計國家隊與三個職業頂級聯盟冠軍；高中、大學與業餘冠軍不列入。 */
const MAJOR_CHAMPIONSHIP=/(世界棒球經典賽冠軍|世界12強賽冠軍|中職總冠軍|日本一|世界大賽冠軍)$/;
export function majorChampionshipCount(honors){
  return (honors||[]).filter(h=>MAJOR_CHAMPIONSHIP.test(h)).length;
}
export function championshipChance(base,active){
  return clamp((Number(base)||0)+(active?5:0),0,100);
}
export function intlFinishIndex(roll,strength,active){
  const r=(Number(roll)||0)+(Number(strength)||0);
  if(r>=96-(active?5:0))return 0;
  return r>=88?1:r>=79?2:r>=46?3:4;
}
