// IDs, English names and image filenames match BATrace's public medal catalogue.
// https://github.com/eiaol/BATrace-IMG/tree/main/public/Medals
// Chinese labels are interface translations.
export const MEDALS=[
  {
    "id": 0,
    "english": "TOP KD MEDAL",
    "file": "medalKdIcon.png",
    "name": "K/D 奖章"
  },
  {
    "id": 1,
    "english": "TOP CAPTURE ZONES MEDAL",
    "file": "medalFlagsIcon.png",
    "name": "占点奖章"
  },
  {
    "id": 6,
    "english": "DESTRUCTION SCORE MEDAL",
    "file": "medalDestractionIcon.png",
    "name": "摧毁分奖章"
  },
  {
    "id": 7,
    "english": "LOSSES SCORE MEDAL",
    "file": "medalLossesIcon.png",
    "name": "战损分奖章"
  },
  {
    "id": 8,
    "english": "AIR SUPERIORITY MEDAL",
    "file": "medalAirSuperiorityIcon.png",
    "name": "空中优势"
  },
  {
    "id": 9,
    "english": "NO FLY ZONE MEDAL",
    "file": "medalNoFlyZoneIcon.png",
    "name": "禁飞区"
  },
  {
    "id": 10,
    "english": "ARMORED FIST MEDAL",
    "file": "medalArmoredFistIcon.png",
    "name": "钢铁之拳"
  },
  {
    "id": 11,
    "english": "RIDE OF THE VALKYRIES MEDAL",
    "file": "medalRideOfTheValkyriesIcon.png",
    "name": "女武神之骑"
  },
  {
    "id": 12,
    "english": "ARTILLERYMAN AND TARGETS MEDAL",
    "file": "medalArtillerymanAndTargetsIcon.png",
    "name": "炮兵与靶子"
  },
  {
    "id": 13,
    "english": "MEATGRINDER MEDAL",
    "file": "medalMeatgrinderIcon.png",
    "name": "绞肉机"
  },
  {
    "id": 14,
    "english": "ADEPTUS MECHANICUS MEDAL",
    "file": "medalAdeptusMechanicusIcon.png",
    "name": "机械神教"
  },
  {
    "id": 15,
    "english": "THE ART OF WAR MEDAL",
    "file": "medalTheArtOfWarIcon.png",
    "name": "战争艺术"
  },
  {
    "id": 16,
    "english": "THE BERSERKER MEDAL",
    "file": "medalBerserkerIcon.png",
    "name": "狂战士"
  },
  {
    "id": 17,
    "english": "NO ONE LEFT BEHIND MEDAL",
    "file": "medalNoOneLeftBehindIcon.png",
    "name": "一个也不能少"
  },
  {
    "id": 18,
    "english": "SPEED DATING MEDAL",
    "file": "medalSpeedDatingIcon.png",
    "name": "极速约会"
  },
  {
    "id": 19,
    "english": "ONE MAN ARMY MEDAL",
    "file": "medalOneManArmyIcon.png",
    "name": "一人成军"
  },
  {
    "id": 20,
    "english": "PURPLE HEART MEDAL",
    "file": "medalPurpleHeartIcon.png",
    "name": "紫心奖章"
  },
  {
    "id": 21,
    "english": "KING OF THE HILL MEDAL",
    "file": "medalKingOfTheHillIcon.png",
    "name": "山丘之王"
  },
  {
    "id": 22,
    "english": "PYRRHIC VICTORY MEDAL",
    "file": "medalPyrrhicVictoryIcon.png",
    "name": "皮洛士式胜利"
  },
  {
    "id": 23,
    "english": "LOGISTICS OFFICER MEDAL",
    "file": "medalLogisticOfficerIcon.png",
    "name": "后勤军官"
  },
  {
    "id": 24,
    "english": "SUPPLY RAIDER MEDAL",
    "file": "medalSupplyRaider.png",
    "name": "补给掠夺者"
  },
  {
    "id": 25,
    "english": "UNDERDOGS MEDAL",
    "file": "medalUnderdogsIcon.png",
    "name": "劣势方奖章"
  },
  {
    "id": 26,
    "english": "MENTOR MEDAL",
    "file": "medalMentor.png",
    "name": "导师"
  },
  {
    "id": 27,
    "english": "GUARDIAN ENGEL MEDAL",
    "file": "medalGuardianAngelIcon.png",
    "name": "守护天使"
  },
  {
    "id": 28,
    "english": "AIRBORNE MEDAL",
    "file": "medalAirborneIcon.png",
    "name": "空降奖章"
  },
  {
    "id": 29,
    "english": "URBANIST MEDAL",
    "file": "medalUrbanistIcon.png",
    "name": "城市专家"
  },
  {
    "id": 99,
    "english": "ASSIST MEDAL TEMP",
    "file": "medalAssistIcon.png",
    "name": "助攻奖章"
  },
  {
    "id": 100,
    "english": "BRONZE MEDAL TEMP",
    "file": "medalBronzeIcon.png",
    "name": "铜质奖章"
  },
  {
    "id": 101,
    "english": "GOLD MEDAL TEMP",
    "file": "medalGoldIcon.png",
    "name": "金质奖章"
  },
  {
    "id": 102,
    "english": "SILVER MEDAL TEMP",
    "file": "medalSilverIcon.png",
    "name": "银质奖章"
  }
];
const byId=new Map(MEDALS.map(m=>[m.id,m]));
export function medalIds(value){
  if(value&&typeof value==='object'&&!Array.isArray(value)){
    const keys=Object.keys(value).sort((a,b)=>Number(a)-Number(b));
    value=keys.every((key,index)=>key===String(index))?keys.map(k=>value[k]):[];
  }
  return Array.isArray(value)?value.filter(id=>Number.isSafeInteger(id)&&id>=0):[];
}
export function renderMedals(value,{esc,icon}){
  const ids=medalIds(value);if(!ids.length)return '';
  return `<div class="player-medals" role="list" aria-label="本局奖章">${ids.map(id=>{
    const medal=byId.get(id),name=medal?.name??`未识别奖章 #${id}`,title=medal?name+' · '+medal.english:name;
    return `<span class="medal-badge" role="listitem" title="${esc(title)}" aria-label="${esc(name)}">${icon('award')}${medal?`<img data-medal-icon src="${esc(new URL('medal-icon-'+medal.file,import.meta.url).href)}" width="20" height="20" alt="" loading="lazy" decoding="async">`:''}</span>`;
  }).join('')}</div>`;
}
