import { courtText } from './court-ui.js';

const known=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER;
const numeric=n=>known(n)?n:null;
const stat=n=>known(n)&&n>=0?n:null;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const protobuf=m=>m.detail_state==='complete'&&(object(m.detail?.data?.Data)||object(m.raw?.Data));
const aliases={DestructionScore:'destruction',LossesScore:'losses',ObjectivesCaptured:'objectives',OldRating:'old_rating',NewRating:'new_rating'};
const unitAliases={KilledCount:'kills',TotalDamageDealt:'damage',TotalDamageReceived:'damage_received',TotalSupplyPointsConsumed:'supply'};
export const UNIT_CATEGORIES=[
  {id:0,name:'侦察',icon:'binoculars'},{id:1,name:'步兵',icon:'footprints'},
  {id:2,name:'载具',icon:'truck'},{id:3,name:'支援',icon:'crosshair'},
  {id:5,name:'直升机',icon:'navigation'},{id:6,name:'固定翼',icon:'plane'},
  {id:4,name:'飞行员',icon:'user-round'},{id:-1,name:'未分类',icon:'boxes'},
];
export function playerMetric(p,key,m){
  if(Object.hasOwn(p.raw??{},key))return stat(p.raw[key]);
  if(Object.hasOwn(p,aliases[key]))return stat(p[aliases[key]]);
  return protobuf(m)?0:null;
}
function unitMetric(u,key,m){
  if(Object.hasOwn(u.raw??{},key))return stat(u.raw[key]);
  if(Object.hasOwn(u,unitAliases[key])&&u[unitAliases[key]]!==null)return stat(u[unitAliases[key]]);
  return protobuf(m)?0:null;
}
export function unitIconName(c){return typeof c?.thumbnailFileName==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(c.thumbnailFileName)?c.thumbnailFileName:null;}
export function unitIconURL(c){const name=unitIconName(c);return name?new URL('unit-icon-'+name+'.png',import.meta.url).href:null;}
export function installUnitDrag(doc=document){
  let drag=null,blocked=null;
  function finish(e){
    if(!drag||e.pointerId!==drag.id)return;
    const state=drag;drag=null;state.root.classList.remove('is-dragging');
    if(state.root.hasPointerCapture?.(state.id))state.root.releasePointerCapture(state.id);
    if(state.moved&&e.type==='pointerup')blocked={root:state.root,until:Date.now()+400};
  }
  doc.addEventListener('pointerdown',e=>{
    blocked=null;
    if(e.pointerType!=='mouse'||e.button!==0)return;
    const root=e.target.closest?.('.match-unit-columns');
    if(!root||root.scrollWidth<=root.clientWidth)return;
    drag={root,id:e.pointerId,x:e.clientX,y:e.clientY,left:root.scrollLeft,moved:false};
  });
  doc.addEventListener('pointermove',e=>{
    if(!drag||e.pointerId!==drag.id)return;
    if(e.buttons===0||!drag.root.isConnected){finish(e);return;}
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    if(!drag.moved){
      if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>6){finish(e);return;}
      if(Math.abs(dx)<6)return;
      drag.moved=true;drag.root.classList.add('is-dragging');drag.root.setPointerCapture?.(drag.id);
    }
    e.preventDefault();drag.root.scrollLeft=drag.left-dx;
  },{passive:false});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])doc.addEventListener(type,finish);
  // A swipe starting on a unit must not open its details when the mouse is released.
  doc.addEventListener('click',e=>{
    if(blocked&&e.detail!==0&&Date.now()<blocked.until&&blocked.root.contains(e.target)){
      e.preventDefault();e.stopImmediatePropagation();blocked=null;
    }
  },true);
  doc.addEventListener('dragstart',e=>{if(e.target.closest?.('.match-unit-columns'))e.preventDefault();});
}
export function playerUnits(m,playerId){
  const groups=new Map();
  for(const u of m.units??[]){
    if(String(u.player_id)!==String(playerId))continue;
    const options=Array.isArray(u.raw?.OptionIds)&&u.raw.OptionIds.every(n=>Number.isSafeInteger(n)&&n>=0)?[...u.raw.OptionIds].sort((a,b)=>a-b):null;
    const key=JSON.stringify([String(u.unit_id),options]);let g=groups.get(key);
    if(!g){
      const category=u.catalogue?.categoryType??u.catalogue?.category_type;
      g={key,unit_id:String(u.unit_id),catalogue:u.catalogue,loadout:u.loadout,options,
        category:typeof category==='number'&&UNIT_CATEGORIES.some(c=>c.id===category)?category:-1,
        instances:[],kills:0,damage:0,damage_received:0,supply:0,deaths:0,refunded:0};groups.set(key,g);
    }
    g.instances.push(u);g.deaths+=Number(known(u.death_time)&&u.death_time>0);g.refunded+=Number(u.refunded===1||u.refunded===true);
    for(const [field,raw] of Object.entries({kills:'KilledCount',damage:'TotalDamageDealt',damage_received:'TotalDamageReceived',supply:'TotalSupplyPointsConsumed'})){
      const value=unitMetric(u,raw,m);g[field]=g[field]===null||value===null||!known(g[field]+value)?null:g[field]+value;
    }
  }
  return [...groups.values()].sort((a,b)=>a.category-b.category||b.instances.length-a.instances.length||a.unit_id.localeCompare(b.unit_id)||a.key.localeCompare(b.key));
}

export function createMatchPlayers({S,esc,icon,fmt,ratio,delta,badge,modal,jsonTree,unitName,participantDeck,closeModal}){
  const sign=n=>n===null?'muted':n<0?'negative':n>0?'positive':'muted';
  const command=(label,action,attrs='')=>`<button type="button" class="text-button" data-action="${action}" ${attrs}>${esc(label)}</button>`;
  const teamName=p=>p.team_id===100?'观战者':p.team_id===null?'队伍未知':`队伍 ${p.team_id===0?'A':p.team_id===1?'B':p.team_id}`;
  const pairs=(items)=>`<dl class="match-player-pairs">${items.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd class="mono">${value}</dd></div>`).join('')}</dl>`;
  const categoryIcon=g=>UNIT_CATEGORIES.find(c=>c.id===g.category)?.icon??'boxes';
  const price=g=>({value:g.loadout?.status==='complete'?stat(g.loadout.cost):stat(g.loadout?.base_cost??g.catalogue?.cost),complete:g.loadout?.status==='complete'});
  function priceTag(g){
    const p=price(g),note=p.complete?'含挂载参考分':'目录基价';
    return `<span class="match-unit-price" title="${esc(note+' · '+(g.loadout?.db_file??'当前目录')+'；非历史对局价格')}"><b>${fmt(p.value)}<small>分</small></b><small>${note}</small></span>`;
  }
  function loadoutNames(g){
    if(g.options===null)return '<span>挂载未提供</span>';
    if(!g.options.length)return '<span>未选择可选挂载</span>';
    return g.options.map(id=>{
      const o=g.loadout?.options?.find(o=>o.id===id);
      return `<span title="${esc((o?.slot??'挂载')+' · #'+id)}">${esc(o?.name??`挂载 #${id}`)}</span>`;
    }).join('');
  }
  function unitCard(g,index,p){
    const url=unitIconURL(g.catalogue),name=unitName(g.catalogue,g.unit_id);
    return `<button type="button" class="match-unit-card" data-action="match-unit" data-id="${esc(p.player_id)}" data-group="${index}" aria-label="${esc(name)} · ${g.instances.length} 次部署详情">
      <span class="match-unit-top"><span class="match-unit-count"><b>×${g.instances.length}</b>${g.refunded?`<small>${g.refunded} 退款</small>`:''}</span>${priceTag(g)}</span>
      <span class="match-unit-portrait">${icon(categoryIcon(g))}${url?`<img data-unit-icon src="${esc(url)}" alt="${esc(name)}" draggable="false" loading="lazy" decoding="async">`:''}</span>
      <strong>${esc(name)}</strong><span class="match-unit-stats"><span>${fmt(g.damage,1)} 伤害</span><b>${fmt(g.kills)} K</b></span>
      <span class="match-unit-options">${loadoutNames(g)}</span>
    </button>`;
  }
  function view(m,p){
    const v=k=>playerMetric(p,k,m),groups=playerUnits(m,p.player_id);
    const d=v('DestructionScore'),l=v('LossesScore'),old=v('OldRating'),next=v('NewRating');
    const rating=old!==null&&next!==null?next-old:numeric(p.rating_delta);
    const summary=[['击毁数量',fmt(v('Destruction')),'摧毁分 '+fmt(d,1)],['损失数量',fmt(v('Losses')),'损失分 '+fmt(l,1)],
      ['分数交换比',ratio(d,l),'单位 K/D '+ratio(v('Destruction'),v('Losses'))],['评分变化',delta(rating),`${fmt(old,1)} → ${fmt(next,1)}`]];
    const registered=p.registered&&p.member_id?`<a class="report-link" href="#friend/${p.member_id}">${esc(courtText('查看朋友档案'))}${icon('arrow-up-right')}</a>`:'';
    return `<div class="match-player-toolbar"><div><span class="mono">#${esc(p.player_id)}</span> · ${esc(teamName(p))} ${p.registered?badge(p.member_name,'yellow'):''}${p.team_id===m.winner_team?badge('胜利'):''}</div>
      <label>本局玩家<select data-match-player-select aria-label="本局玩家">${m.participants.map(x=>`<option value="${esc(x.player_id)}" ${x.player_id===p.player_id?'selected':''}>${esc(x.name)} · ${esc(teamName(x))}</option>`).join('')}</select></label>${registered}</div>
      <p class="hint">${esc(m.map_name??'')} · 对局 #${esc(m.id)} · 本局数据${m.detail_state==='complete'?'':' · 详情尚未归档'}</p>
      <div class="match-player-summary">${summary.map(([label,value,note],i)=>`<div><span>${label}</span><strong class="mono ${i===3?sign(rating):''}">${value}</strong><small>${note}</small></div>`).join('')}</div>
      <div class="match-player-sections">
        <section><h3>${icon('crosshair')}战斗统计</h3>${pairs([['造成伤害',fmt(v('DamageDealt'),1)],['承受伤害',fmt(v('DamageReceived'),1)],['造成友伤',fmt(v('DamageFriendlyFireDealt'),1)],['承受友伤',fmt(v('DamageFriendlyFireReceived'),1)],['占领目标',fmt(v('ObjectivesCaptured'))]])}</section>
        <section><h3>${icon('coins')}单位经济</h3>${pairs([['出场单位价值',fmt(v('TotalSpawnedUnitScore'))],['退款单位价值',fmt(v('TotalRefundedUnitScore'))],['部署实例',fmt(m.detail_state==='complete'?groups.reduce((n,g)=>n+g.instances.length,0):null)],['退款实例',fmt(m.detail_state==='complete'?groups.reduce((n,g)=>n+g.refunded,0):null)]])}</section>
        <section><h3>${icon('truck')}补给统计</h3>${pairs([['消耗补给',fmt(v('SupplyPointsConsumed'))],['补给队友',fmt(v('SupplyPointsConsumedByAllies'))],['从队友补给',fmt(v('SupplyPointsConsumedFromAllies'))],['占领补给',fmt(v('SupplyCaptured'))],['被敌占补给',fmt(v('SupplyCapturedByEnemy'))],['空投补给',fmt(v('SupplyAirdropped'))]])}</section>
        <section><h3>${icon('award')}经验统计</h3>${pairs([['原始经验',fmt(v('RawExp'),1)],['乘数后经验',fmt(v('RawExpWithMultipliers'),1)],['总经验',fmt(v('TotalExp'),1)]])}${participantDeck(p)}</section>
      </div>
      <section class="match-player-units"><div class="section-heading"><h3>单位详细数据</h3><small>${groups.length} 种型号 / 挂载 · ${groups.reduce((n,g)=>n+g.instances.length,0)} 次部署</small></div>
      ${groups.length?`<div class="match-unit-columns" tabindex="0" role="region" aria-label="本局单位分类">${UNIT_CATEGORIES.filter(c=>![4,-1].includes(c.id)||groups.some(g=>g.category===c.id)).map(c=>`<section><h4>${icon(c.icon)}${c.name}</h4><div>${groups.some(g=>g.category===c.id)?groups.map((g,i)=>g.category===c.id?unitCard(g,i,p):'').join(''):'<p class="hint">无出场记录</p>'}</div></section>`).join('')}</div>`:`<p class="hint">${m.detail_state==='complete'?'本局没有归档到该玩家的单位实例。':'本局尚无完整单位详情。'}</p>`}</section>
      <details class="match-player-raw"><summary>全部玩家字段</summary>${jsonTree(p.raw)}</details>`;
  }
  function seconds(m,n){
    if(!known(n))return '—';const start=m.detail?.data?.StartTime??m.raw?.StartTime??(m.end_time-m.duration);
    if(!known(start)||n<start)return '—';const elapsed=Math.floor(n-start);return `${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}`;
  }
  function unitView(m,p,index){
    const g=playerUnits(m,p.player_id)[index];if(!g)return null;
    const name=unitName(g.catalogue,g.unit_id);
    return {title:`${name} · 本局单位`,html:`<div class="match-player-toolbar">${command('← 返回 '+p.name,'match-player',`data-id="${esc(p.player_id)}"`)}<span class="hint">单位 #${esc(g.unit_id)} · ${g.instances.length} 次部署</span>${priceTag(g)}</div>
      ${pairs([['总击杀',fmt(g.kills)],['造成伤害',fmt(g.damage,1)],['承受伤害',fmt(g.damage_received,1)],['消耗补给',fmt(g.supply)],['记录阵亡',fmt(g.deaths)],['退款',fmt(g.refunded)]])}
      <section class="match-loadout-detail"><h3>本局实际挂载</h3>${g.options===null?'<p class="hint">未提供可确认的实际挂载</p>':g.options.length?`<div class="table-wrap"><table><thead><tr><th>挂载槽</th><th>已选挂载</th><th>ID</th><th class="numeric">增减分</th></tr></thead><tbody>${g.options.map(id=>{const o=g.loadout?.options?.find(o=>o.id===id);return `<tr><td>${esc(o?.slot??'未解析')}</td><td>${esc(o?.name??`挂载 #${id}`)}</td><td class="mono">${id}</td><td class="numeric mono">${o?.cost===null||o?.cost===undefined?'—':(o.cost>0?'+':'')+fmt(o.cost)}</td></tr>`;}).join('')}</tbody></table></div>`:'<p class="hint">本组未选择可选挂载</p>'}
      <p class="hint">${g.loadout?.status==='complete'?`基价 ${fmt(g.loadout.base_cost)} + 已选挂载 ${fmt(g.loadout.cost-g.loadout.base_cost)} = ${fmt(g.loadout.cost)} 分`:'挂载目录不完整，暂不计算含挂载总分'}${g.loadout?.db_file?' · '+esc(g.loadout.db_file):''} · 当前目录参考值，非历史价格</p></section>
      <div class="table-wrap"><table><thead><tr><th>实例 NetID</th><th>出场</th><th>阵亡</th><th>状态</th><th class="numeric">击杀</th><th class="numeric">伤害</th><th class="numeric">承伤</th><th class="numeric">补给</th></tr></thead><tbody>${g.instances.map(u=>`<tr><td class="mono">${esc(u.net_id)}</td><td>${seconds(m,u.spawn_time)}</td><td>${seconds(m,u.death_time)}</td><td>${u.refunded?'已退款':u.death_time?'已阵亡':'未记录阵亡'}</td><td class="numeric mono">${fmt(unitMetric(u,'KilledCount',m))}</td><td class="numeric mono">${fmt(unitMetric(u,'TotalDamageDealt',m),1)}</td><td class="numeric mono">${fmt(unitMetric(u,'TotalDamageReceived',m),1)}</td><td class="numeric mono">${fmt(unitMetric(u,'TotalSupplyPointsConsumed',m))}</td></tr>`).join('')}</tbody></table></div>
      ${g.instances.map(u=>`<details class="match-player-raw"><summary>实例 ${esc(u.net_id)} · 全部字段</summary>${jsonTree(u.raw)}</details>`).join('')}<details class="match-player-raw"><summary>单位目录字段</summary>${jsonTree(g.catalogue)}</details>`};
  }
  function open(playerId,group=null){
    const m=S.currentMatch,p=m?.participants.find(p=>String(p.player_id)===String(playerId));if(!p)return;
    const unit=group===null?null:unitView(m,p,group);if(group!==null&&!unit)return;
    modal(unit?.title??`${p.name} · 本局详情`,unit?.html??view(m,p),{wide:true});
    const dialog=document.querySelector('#modal');dialog.classList.add('match-player-modal');dialog.scrollTop=0;
    dialog.querySelector('.modal-header button')?.focus({preventScroll:true});
  }
  function install(){
    installUnitDrag();
    document.addEventListener('click',event=>{
      const el=event.target.closest('[data-action="match-player"],[data-action="match-unit"]');if(!el)return;
      event.preventDefault();const group=el.dataset.action==='match-unit'?Number(el.dataset.group):null;
      if(group!==null&&(!Number.isSafeInteger(group)||group<0))return;open(el.dataset.id,group);
    });
    document.addEventListener('change',e=>{if(e.target.matches('[data-match-player-select]'))open(e.target.value);});
    document.addEventListener('error',e=>{if(e.target.matches?.('img[data-unit-icon]'))e.target.hidden=true;},true);
    window.addEventListener('hashchange',()=>{if(document.querySelector('#modal').classList.contains('match-player-modal'))closeModal();});
  }
  return {view,unitView,open,install};
}
