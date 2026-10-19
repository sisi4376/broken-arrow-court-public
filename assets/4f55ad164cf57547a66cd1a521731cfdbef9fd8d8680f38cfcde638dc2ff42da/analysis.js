import { courtText, courtHtml } from './court-ui.js';
import { sortableTable, scoreRatio } from './table-sort.js';
export function createAnalysis({S,esc,icon,fmt,pct,ratio,delta,signedClass,badge,empty,kpi,heading,filterBar,time,mode=n=>String(n??'未知'),unitName,canManage,button,footer,modal,toast,api,closeModal,route,icons,$,courtPanel=()=>''}) {

function analysisControls() {
  return `<div class="analysis-controls"><label>排行最低已知结果<select id="analysis-min">${[1,3,5,10,20].map(n=>`<option value="${n}" ${S.analysisMin===n?'selected':''}>${n} 局</option>`).join('')}</select></label><span class="hint">点击表格列名切换升序 / 降序。低于门槛仍展示，不参与最佳 / 最差排行。</span></div>`;
}
function analysisTableId(name) {return (S.route==='friend'?'friend':'overall')+'-'+name;}
function sampleTag(r) {return r.decided<S.analysisMin?badge('样本少','muted'):'';}
function resultCell(r) {return `<div class="win-cell"><span class="mono ${r.decided>=S.analysisMin?'positive':''}">${pct(r.wins,r.decided)}</span><div class="track"><span style="width:${r.decided?100*r.wins/r.decided:0}%"></span></div></div><div class="table-sub">${r.wins} 胜 / ${r.losses_count} 负${r.unknown?` / ${r.unknown} 未知`:''}</div>`;}
function analysisNotice() {return courtHtml`<div class="notice section-space">${icon('info')}仅计算当前筛选下的合格开黑局。胜率分母只含结果已知的场次；多账号合并到朋友，同局分处两队时该朋友胜负记为未知。总体胜率按朋友参战人次计算，朋友分处两边时双方都会计入。</div>`;}
function deckNotice(data) {
  return `<div class="notice section-space">${icon('info')}已识别 ${fmt(data.overview.deck_known)} / ${fmt(data.overview.matches)} 人次。专精组合由出场单位与当前公开单位池推定，或在单场详情中人工确认；未出场卡牌、转让单位和版本差异可能影响推定。无法唯一识别的组合单独列出，不参与偏好排行。${data.model?.db_file?`目录：${esc(data.model.db_file)}。`:''}</div>`;
}
function performanceTable(rows,type='deck') {
  if(!rows.length)return empty('暂无可分析记录','调整筛选范围，或等待战绩归档。','','chart-no-axes-combined',true);
  return sortableTable(analysisTableId(type==='deck'?'decks':'maps'),`<div class="table-wrap"><table class="analysis-table"><thead><tr><th>${type==='deck'?'专精组合':'地图'}</th><th class="numeric">参战人次</th><th class="numeric">对局数</th><th>胜率 · 胜负</th><th class="numeric">累计评分变化</th><th class="numeric">场均摧毁</th><th class="numeric">场均损失</th><th class="numeric">交换比</th><th class="numeric">场均占点</th><th>样本</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="table-title">${type==='map'?`<button class="text-button" data-action="analysis-map" data-value="${esc(r.map_id)}">${esc(r.name)}</button>`:`${r.country?`<span class="faint">${esc(r.country)} · </span>`:''}${esc(r.name)}`}${type==='deck'?`<div class="table-sub">${r.key==='unknown'?'在单场详情中确认组合':`${fmt(r.inferred)} 推定 / ${fmt(r.confirmed)} 已确认或源数据`}</div>`:''}</td><td class="numeric mono">${fmt(r.matches)}</td><td class="numeric mono">${fmt(r.unique_matches)}</td><td>${resultCell(r)}</td><td class="numeric mono ${signedClass(r.rating_delta)}">${delta(r.rating_delta)}</td><td class="numeric mono">${fmt(r.avg_destruction,1)}</td><td class="numeric mono">${fmt(r.avg_losses,1)}</td><td class="numeric mono">${ratio(r.destruction,r.losses)}</td><td class="numeric mono">${fmt(r.avg_objectives,2)}</td><td>${sampleTag(r)}</td></tr>`).join('')}</tbody></table></div>`,rows,[
{index:0,key:'name',label:type==='deck'?'专精组合':'地图',type:'text',value:r=>r.name},
{index:1,key:'matches',label:'参战人次',value:r=>r.matches},
{index:2,key:'unique_matches',label:'对局数',value:r=>r.unique_matches},
{index:3,key:'win_rate',label:'胜率',value:r=>r.win_rate},
{index:4,key:'rating_delta',label:'累计评分变化',value:r=>r.rating_delta},
{index:5,key:'destruction',label:'场均摧毁',value:r=>r.avg_destruction},
{index:6,key:'losses',label:'场均损失',value:r=>r.avg_losses,first:'asc'},
{index:7,key:'exchange',label:'交换比',value:r=>scoreRatio(r.destruction,r.losses)},
{index:8,key:'objectives',label:'场均占点',value:r=>r.avg_objectives}]);
}
function deckMapTable(rows) {
  if(!rows.length)return empty('暂无组合与地图交叉样本','识别专精组合后，这里会列出它在不同地图的表现。','','map',true);
  return sortableTable(analysisTableId('deck-maps'),`<div class="table-wrap"><table><thead><tr><th>专精组合</th><th>地图</th><th class="numeric">参战人次</th><th>胜率 · 胜负</th><th class="numeric">累计评分变化</th><th>样本</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="table-title">${esc(r.deck)}</td><td>${esc(r.map)}</td><td class="numeric mono">${r.matches}</td><td>${resultCell(r)}</td><td class="numeric mono ${signedClass(r.rating_delta)}">${delta(r.rating_delta)}</td><td>${sampleTag(r)}</td></tr>`).join('')}</tbody></table></div>`,rows,[
{index:0,key:'deck',label:'专精组合',type:'text',value:r=>r.deck},
{index:1,key:'map',label:'地图',type:'text',value:r=>r.map},
{index:2,key:'matches',label:'参战人次',value:r=>r.matches},
{index:3,key:'win_rate',label:'胜率',value:r=>r.win_rate},
{index:4,key:'rating_delta',label:'累计评分变化',value:r=>r.rating_delta}]);
}
function preferenceUnits(units) {
  if(!units.length)return empty('暂无完整单位记录',courtText('比赛补齐详情后会自动统计常用单位。'),'','crosshair',true);
  return sortableTable(analysisTableId('units'),courtHtml`<div class="section-heading"><h2>常用单位</h2></div><div class="table-wrap"><table><thead><tr><th>单位</th><th class="numeric">出场人次</th><th class="numeric">使用率</th><th class="numeric">出场次数</th><th>使用时胜率</th><th class="numeric">击杀</th><th class="numeric">阵亡</th><th class="numeric">伤害</th><th class="numeric">单次均伤</th><th class="numeric">退款次数</th></tr></thead><tbody>${units.map(u=>`<tr><td class="table-title">${esc(unitName(u.catalogue,u.unit_id))}<div class="table-sub">#${esc(u.unit_id)}</div></td><td class="numeric mono">${fmt(u.matches)}</td><td class="numeric mono">${fmt(100*u.usage_rate,1)}%</td><td class="numeric mono">${fmt(u.instances)}</td><td>${resultCell(u)}${sampleTag(u)}</td><td class="numeric mono">${fmt(u.kills)}</td><td class="numeric mono">${fmt(u.deaths)}</td><td class="numeric mono">${fmt(u.damage,1)}</td><td class="numeric mono">${fmt(u.damage/u.instances,1)}</td><td class="numeric mono">${fmt(u.refunded)}</td></tr>`).join('')}</tbody></table></div><p class="hint section-space">列表默认按出场局数排序；画像中的最多使用单位按部署次数计算。同局同一朋友多个账号合并。使用率只以详情完整的参战人次为分母；使用时胜率表示该朋友在使用该单位的对局中的胜率，不代表单位本身的胜率或因果效果。</p>`,units,[
{index:0,key:'name',label:'单位',type:'text',value:r=>unitName(r.catalogue,r.unit_id)},
{index:1,key:'matches',label:'出场人次',value:r=>r.matches},
{index:2,key:'usage',label:'使用率',value:r=>r.usage_rate},
{index:3,key:'instances',label:'出场次数',value:r=>r.instances},
{index:4,key:'win_rate',label:'使用时胜率',value:r=>r.win_rate},
{index:5,key:'kills',label:'击杀',value:r=>r.kills},
{index:6,key:'deaths',label:'阵亡',value:r=>r.deaths,first:'asc'},
{index:7,key:'damage',label:'伤害',value:r=>r.damage},
{index:8,key:'average_damage',label:'单次均伤',value:r=>r.instances?r.damage/r.instances:null},
{index:9,key:'refunded',label:'退款次数',value:r=>r.refunded}]);
}
function insightCard(title,value,detail,ico='users',tone='') {return `<article class="insight-card"><div class="insight-label">${icon(ico)}${esc(title)}</div><div class="insight-value ${tone}">${value}</div><p>${esc(detail)}</p></article>`;}
function friendLink(row) {return `<a href="#friend/${row.member_id}" class="yellow">${esc(row.name)}</a>`;}
function friendInsights(data) {
  const t=data.teammates,f=data.favorites,min=data.min_games,h=data.unit_highlights??{};
  function unitCard(title,rows,metric,ico){
    const leaders=rows??[],u=leaders[0];
    const value=u?leaders.slice(0,3).map(r=>esc(unitName(r.catalogue,r.unit_id))).join(' / '):'暂无记录';
    const primary=u?(metric==='instances'?`累计部署 ${fmt(u.instances)} 次`:metric==='damage'?`累计伤害 ${fmt(u.damage,1)}`:`累计击杀 ${fmt(u.kills)}`):'';
    const detail=u?(leaders.length>1?`每种${primary} · ${fmt(leaders.length)} 种单位并列${leaders.length>3?'，展示前 3 种':''}`:primary+(metric==='instances'?` · 覆盖 ${fmt(u.matches)} 局`:` · 部署 ${fmt(u.instances)} 次`)):(data.overview.detail_matches?'当前筛选内暂无'+(metric==='damage'?'伤害':metric==='kills'?'击杀':'部署')+'记录':'等待完整单位明细');
    return insightCard(courtText(title),value,detail,ico);
  }
  return `<section class="profile-unit-highlights" aria-label="单位战果"><div class="insight-grid">${unitCard('最多使用单位',h.most_used,'instances','repeat-2')}${unitCard('伤害最高单位',h.most_damage,'damage','flame')}${unitCard('击杀最多单位',h.most_kills,'kills','crosshair')}</div></section><div class="insight-grid section-space">${insightCard('最常用专精组合',f.deck?`${esc(f.deck.country)} · ${esc(f.deck.name)}`:'待识别',f.deck?`${f.deck.matches} 局 · 胜率 ${pct(f.deck.wins,f.deck.decided)} · 含 ${f.deck.inferred} 局推定`:'补齐详情或在单场确认组合','archive')}${insightCard('最顺手的地图',f.best_map?esc(f.best_map.name):'样本不足',f.best_map?`${f.best_map.decided} 局已知结果 · ${pct(f.best_map.wins,f.best_map.decided)} 胜率`:`至少 ${min} 局已知结果后参与排行`,'map','positive')}${insightCard('组队最多的队友',t.most?friendLink(t.most):courtText('暂无同队搭档'),t.most?`同队 ${t.most.matches} 局 · 胜率 ${pct(t.most.wins,t.most.decided)}`:courtText('只计算登记朋友中实际同队的记录'),'users')}${insightCard('胜率最高的搭档',t.best?friendLink(t.best):'样本不足',t.best?`${t.best.decided} 局已知结果 · ${pct(t.best.wins,t.best.decided)} 胜率${t.eligible===1?' · 仅此一组达到门槛':''}`:`至少 ${min} 局已知结果后参与排行`,'handshake','positive')}${insightCard('胜率最低的搭档',t.worst?friendLink(t.worst):'样本不足',t.worst?`${t.worst.decided} 局已知结果 · ${pct(t.worst.wins,t.worst.decided)} 胜率${t.eligible===1?' · 仅此一组达到门槛':''}`:`至少 ${min} 局已知结果后参与排行`,'swords')}</div>`;
}
function teammateAnalysis(data) {
  const rows=data.teammates.rows;
  if(!rows.length)return empty(courtText('暂无共同开黑记录'),'','','handshake',true);
  return sortableTable(analysisTableId('teammates'),courtHtml`<div class="table-wrap"><table><thead><tr><th>朋友</th><th class="numeric">同局</th><th class="numeric">同队</th><th>同队胜率</th><th class="numeric">与个人总胜率差</th><th class="numeric">我的累计涨分</th><th class="numeric">对位场次</th><th>对位时我的胜率</th><th>已知结果</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="table-title">${friendLink(r)}${r.unclassified?`<div class="table-sub">${r.unclassified} 局队伍关系不明确</div>`:''}</td><td class="numeric mono">${r.together}</td><td class="numeric mono">${r.same.matches}</td><td>${resultCell(r.same)}</td><td class="numeric mono">${r.same.win_rate!==null&&data.overview.win_rate!==null?`${delta(100*(r.same.win_rate-data.overview.win_rate))} <span class="faint">百分点</span>`:'—'}</td><td class="numeric mono ${signedClass(r.same.rating_delta)}">${delta(r.same.rating_delta)}</td><td class="numeric mono">${r.opposed.matches}</td><td>${resultCell(r.opposed)}</td><td class="mono">${fmt(r.same.decided)} 局 ${sampleTag(r.same)}</td></tr>`).join('')}</tbody></table></div><p class="hint section-space">同局不等于同队；最佳 / 最差搭档只按同队已知结果计算，并应用最低样本门槛。胜率差只是关联对照，也会受到地图、模式和其他队友的影响。</p>`,rows,[
{index:0,key:'name',label:courtText('朋友'),type:'text',value:r=>r.name},
{index:1,key:'together',label:'同局',value:r=>r.together},
{index:2,key:'matches',label:'同队',value:r=>r.same.matches},
{index:3,key:'win_rate',label:'同队胜率',value:r=>r.same.win_rate},
{index:4,key:'win_delta',label:'与个人总胜率差',value:r=>r.same.win_rate!==null&&data.overview.win_rate!==null?r.same.win_rate-data.overview.win_rate:null},
{index:5,key:'rating_delta',label:'我的累计涨分',value:r=>r.same.rating_delta},
{index:6,key:'opposed_matches',label:'对位场次',value:r=>r.opposed.matches},
{index:7,key:'opposed_win_rate',label:'对位时我的胜率',value:r=>r.opposed.win_rate},
{index:8,key:'decided',label:'已知结果',value:r=>r.same.decided}]);
}
function friendTrend(data) {
  const t=data.trend;
  return `<div class="section-heading"><h2>近期状态</h2><small>当前筛选内，按比赛结束时间</small></div><div class="form-strip"><span>当前：<b class="${t.current_streak>0?'positive':t.current_streak<0?'negative':''}">${t.current_streak?`${Math.abs(t.current_streak)} 连${t.current_streak>0?'胜':'败'}`:'暂无连续胜负'}</b></span><span>最长连胜 <b>${t.best_win_streak}</b></span><span>最长连败 <b>${t.best_loss_streak}</b></span><span>最近 ${t.recent.matches} 局胜率 <b>${pct(t.recent.wins,t.recent.decided)}</b></span></div><div class="result-strip">${t.recent_results.map(r=>`<a class="result-chip ${r.won===1?'win':r.won===0?'loss':'undecided'}" href="#match/${r.match_id}" title="#${r.match_id} · ${time(r.end_time)}">${r.won===1?'胜':r.won===0?'负':'?'}</a>`).join('')}</div><div class="section-heading section-space"><h2>每月胜率</h2><small>香港时间</small></div><div class="period-list">${t.periods.length?t.periods.map(r=>`<div class="period-row"><span class="mono">${esc(r.key)}</span><div class="track"><span style="width:${r.win_rate===null?0:100*r.win_rate}%"></span></div><span class="mono">${pct(r.wins,r.decided)}</span><small>${r.matches} 局 · ${r.wins} 胜 / ${r.losses_count} 负</small></div>`).join(''):'<p class="hint">暂无走势记录</p>'}</div>`;
}
function friendRecent(data) {
  const a=data.match_archive??{scope:'court',items:[],total:0,page:1,pages:1};S.friendMatchPage=a.page;
  const note=a.scope==='other'?`<div class="notice">${icon('archive')}未达到三位登记朋友参与的比赛，不计入刑期与法庭榜单。</div>`:'';
  const table=a.items.length?`<div class="table-wrap"><table><thead><tr><th>对局 / 地图</th><th>结束时间</th><th>游戏账号</th><th>模式 / 登记人数</th><th>结果</th><th class="numeric">评分变化</th><th class="numeric">摧毁 / 损失</th><th>详情</th></tr></thead><tbody>${a.items.map(r=>`<tr><td><a class="table-title" href="#match/${r.id}">${esc(r.map)}</a><div class="table-sub">#${r.id}</div></td><td class="nowrap">${time(r.end_time,true)}</td><td>${r.accounts.map(x=>esc(x.name)).join(' / ')}</td><td>${esc(mode(r.mode))}<div class="table-sub">${r.friend_count} 位登记朋友</div></td><td>${badge(r.won===1?'胜利':r.won===0?'失败':'未知',r.won===1?'':r.won===0?'red':'muted')}</td><td class="numeric mono ${signedClass(r.rating_delta)}">${delta(r.rating_delta)}</td><td class="numeric mono">${fmt(r.destruction)} / ${fmt(r.losses)}</td><td>${badge(r.detail_state==='complete'?'完整详情':r.detail_state==='error'?'待重试':'已存摘要',r.detail_state==='complete'?'':'muted')}</td></tr>`).join('')}</tbody></table></div>`:empty('暂无符合筛选的对局','','','archive',true);
  return note+table+`<div class="pagination"><span>${fmt(a.total)} 局 · 已同步记录</span><div class="flex"><button type="button" class="icon-button" data-action="friend-page-prev" aria-label="上一页个人对局" title="上一页" ${a.page<=1?'disabled':''}>${icon('chevron-left')}</button><span class="mono">${a.page} / ${a.pages}</span><button type="button" class="icon-button" data-action="friend-page-next" aria-label="下一页个人对局" title="下一页" ${a.page>=a.pages?'disabled':''}>${icon('chevron-right')}</button></div></div>`;
}
function friendView(data) {
  const o=data.overview;S.currentFriend=data;
  const archive=['matches','other-matches'].includes(S.friendTab),counts=data.match_archive?.counts;
  return `<div class="friend-report ${archive?'friend-match-view':''}">`+heading(courtHtml`${data.member.name} · 详细分析`,'FRIEND / PLAYER REPORT',courtText('多账号合并 · 分析与刑期仅计入合格开黑对局'),courtHtml`<a href="#analytics" class="back-link">← 开黑分析</a>`)+courtHtml`<label class="friend-switch">切换朋友<select id="friend-switch">${S.members.map(m=>`<option value="${m.id}" ${m.id===data.member.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label>`+filterBar({personal:true})+`<div class="kpis">${kpi('开黑场次',fmt(o.matches),`${o.wins} 胜 / ${o.losses_count} 负 / ${o.unknown} 未知`,'swords')}${kpi('胜率',pct(o.wins,o.decided),`${o.decided} 局结果已知`,'chart-no-axes-combined','positive')}${kpi('累计评分变化',delta(o.rating_delta),`${o.rating_samples} 局有评分变化数据`,'chart-no-axes-combined',signedClass(o.rating_delta))}${kpi('详情覆盖',`${o.detail_matches}<small>/ ${o.matches}</small>`,courtText('单位偏好只使用完整详情'),'database')}</div>`+courtPanel(data.court)+(archive?'':analysisControls())+`<div class="tabs analysis-tabs">${[['overview',courtText('综合画像')],['decks','专精组合'],['teammates',courtText('队友关系')],['maps','地图表现'],['units',courtText('常用单位')],['matches',`法庭对局${counts?' · '+counts.court:''}`],['other-matches',`其他对局${counts?' · '+counts.other:''}`]].map(([v,n])=>`<button data-action="friend-tab" data-value="${v}" class="${S.friendTab===v?'active':''}">${n}</button>`).join('')}</div>`+(S.friendTab==='overview'?friendInsights(data)+`<section class="section-space">${friendTrend(data)}</section>`:S.friendTab==='decks'?performanceTable(data.decks)+deckNotice(data)+`<div class="section-heading section-space"><h2>组合 × 地图</h2></div>`+deckMapTable(data.deck_maps):S.friendTab==='teammates'?teammateAnalysis(data):S.friendTab==='maps'?performanceTable(data.maps,'map'):S.friendTab==='units'?preferenceUnits(data.units):friendRecent(data))+(archive?'':analysisNotice())+'</div>';
}
function deepAnalytics(data) {
  return analysisControls()+(S.analyticsTab==='decks'?performanceTable(data.decks)+deckNotice(data)+`<div class="section-heading section-space"><h2>组合 × 地图</h2></div>`+deckMapTable(data.deck_maps):S.analyticsTab==='maps'?performanceTable(data.maps,'map'):preferenceUnits(data.units))+analysisNotice();
}
function participantDeck(p) {
  if(!p.registered)return '';
  const d=p.deck??{name:'专精组合未确认',source:'unknown'};
  return `<div class="participant-deck"><span>${esc(d.name)}</span><small class="${d.source==='inferred'?'faint':'muted'}">${d.source==='inferred'?'推定':d.source==='unknown'?'未确认':'已确认 / 源数据'}</small>${canManage(p.member_id)?`<button class="text-button" data-action="edit-deck" data-id="${p.player_id}" aria-label="确认 ${esc(p.name)} 的专精组合">确认 / 修正</button>`:''}</div>`;
}
function deckModal(playerId) {
  const p=S.currentMatch.participants.find(p=>p.player_id===playerId);if(!p)return;
  const specs=S.currentMatch.specializations??[];if(!specs.length)throw new Error('专精目录尚未加载，请先更新分析目录');
  const ids=p.deck?.spec_ids??[];
  const options=selected=>'<option value="">请选择专精</option>'+specs.map(s=>`<option value="${s.id}" ${s.id===selected?'selected':''}>${esc(s.display_name)}</option>`).join('');
  modal(`${p.member_name} · 确认本局专精组合`,courtHtml`<form id="deck-form" data-player="${p.player_id}"><p class="hint">对局 #${S.currentMatch.id} · ${esc(p.name)}。两种专精必须属于同一国家，确认后用于组合偏好和胜率统计。</p><div class="form-grid section-space"><label>第一种专精<select id="deck-spec1" name="spec1" required>${options(ids[0])}</select></label><label>第二种专精<select id="deck-spec2" name="spec2" required>${options(ids[1])}</select></label></div>${footer('确认组合')}<div class="section-space">${button('清除人工确认，恢复推定','clear-deck','rotate-ccw','','data-id="'+p.player_id+'"')}</div></form>`);
}

document.addEventListener('click',event=>{
  if(event.target.closest('[data-action="back-matches"]')&&S.matchReturnFriend){event.preventDefault();event.stopImmediatePropagation();location.hash=`friend/${S.matchReturnFriend}`;return;}
  if(event.target.closest('a[href^="#match/"]'))S.matchReturnFriend=S.route==='friend'?S.currentFriend?.member.id:null;
},true);
document.addEventListener('click',async event=>{
  const el=event.target.closest('[data-action]');if(!el||!['friend-tab','friend-page-prev','friend-page-next','analysis-map','edit-deck','clear-deck'].includes(el.dataset.action))return;
  event.preventDefault();event.stopImmediatePropagation();el.disabled=true;
  try {
    if(el.dataset.action==='friend-tab'){S.friendTab=el.dataset.value;S.friendMatchPage=1;if(['matches','other-matches'].includes(S.friendTab))await route();else{$('#main').innerHTML=friendView(S.currentFriend);icons();}}
    else if(el.dataset.action==='friend-page-prev'||el.dataset.action==='friend-page-next'){S.friendMatchPage=Math.max(1,S.friendMatchPage+(el.dataset.action==='friend-page-next'?1:-1));await route();}
    else if(el.dataset.action==='analysis-map'){S.filters.map=el.dataset.value;await route();}
    else if(el.dataset.action==='edit-deck')deckModal(el.dataset.id);
    else {await api(`/api/matches/${S.currentMatch.id}/players/${el.dataset.id}/deck`,{method:'DELETE'});closeModal();await route();toast('已恢复按出场单位推定');}
  }catch(error){toast(error.message,true);}finally{if(el.isConnected)el.disabled=false;}
});
document.addEventListener('change',async event=>{
  const el=event.target;if(!['analysis-min','friend-switch','deck-spec1'].includes(el.id))return;
  event.stopImmediatePropagation();
  try {
    if(el.id==='friend-switch'){S.friendMatchPage=1;location.hash=`friend/${el.value}`;return;}
    if(el.id==='deck-spec1'){
      const specs=S.currentMatch.specializations;const first=specs.find(s=>s.id===Number(el.value));const second=$('#deck-spec2');const previous=second.value;
      second.innerHTML='<option value="">请选择专精</option>'+specs.filter(s=>s.countryId===first?.countryId&&s.id!==first?.id).map(s=>`<option value="${s.id}" ${String(s.id)===previous?'selected':''}>${esc(s.display_name)}</option>`).join('');return;
    }
    S.analysisMin=Number(el.value);
    await route();
  }catch(error){toast(error.message,true);}
});
document.addEventListener('submit',async event=>{
  const form=event.target;if(form.id!=='deck-form')return;
  event.preventDefault();event.stopImmediatePropagation();const submit=$('button[type=submit]',form);if(submit)submit.disabled=true;
  try{const f=new FormData(form);await api(`/api/matches/${S.currentMatch.id}/players/${form.dataset.player}/deck`,{method:'PUT',body:{spec1:Number(f.get('spec1')),spec2:Number(f.get('spec2'))}});closeModal();await route();toast('本局专精组合已确认，分析已更新');}
  catch(error){$('.form-error',form).textContent=error.message;}
  finally{if(submit?.isConnected)submit.disabled=false;}
});
return {friendView,deepAnalytics,participantDeck};
}
