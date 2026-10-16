import { courtText, courtHtml } from './court-ui.js';
import { sortableTable } from './table-sort.js';

export function createPerformance({S,esc,icon,fmt,empty}) {
  const friend = r => `<a href="#friend/${r.member_id}" class="friend-report-link">${esc(r.name)}</a>`;
  function performanceTabs() {
    return `<div class="performance-toolbar"><div class="segmented" role="group" aria-label="表现数据分类">${[['battle','战斗'],['economy','经济'],['supply','补给']].map(([value,label])=>`<button type="button" data-action="performance-mode" data-value="${value}" class="${S.performanceMode===value?'active':''}" aria-pressed="${S.performanceMode===value}">${label}</button>`).join('')}</div></div>`;
  }
  function detailPerformance(members) {
    const supply=S.performanceMode==='supply';
    const columns=supply?[
      ['avg_supply_consumed','场均消耗补给'],['avg_supplied_allies','场均补给队友'],['avg_received_allies','场均从队友补给'],
    ]:[
      ['avg_spawned_score','场均出场分数'],['avg_refunded_score','场均退款分数'],['avg_kills','场均击毁数量'],['avg_units_lost','场均损失数量'],['avg_experience','场均经验'],['avg_raw_experience','场均原始经验'],
    ];
    return sortableTable('friends-'+S.performanceMode,courtHtml`<div class="table-wrap"><table><thead><tr><th>朋友</th><th class="numeric">开黑局数</th><th class="numeric">详情样本</th>${columns.map(([,label])=>`<th class="numeric">${label}</th>`).join('')}</tr></thead><tbody>${members.map(r=>`<tr><td class="table-title">${friend(r)}</td><td class="numeric mono">${fmt(r.matches)}</td><td class="numeric mono">${fmt(r.detail_matches)} / ${fmt(r.matches)}</td>${columns.map(([key])=>`<td class="numeric mono ${key==='avg_supplied_allies'?'positive':key==='avg_received_allies'?'cyan':''}">${fmt(r[key],1)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,members,[
      {index:0,key:'name',label:courtText('朋友'),type:'text',value:r=>r.name},
      {index:1,key:'matches',label:'开黑局数',value:r=>r.matches},
      {index:2,key:'detail_matches',label:'详情样本',value:r=>r.detail_matches},
      ...columns.map(([key,label],i)=>({index:i+3,key,label,value:r=>r[key]})),
    ])+courtHtml`<p class="hint section-space">${supply?courtText('从队友补给包括所有同队玩家，不仅限于登记朋友。补给队友不等于自己消耗补给。'):'出场、退款、击毁数量与经验来自完整赛后详情。'}场均值仅以详情完整的对局为分母；同一朋友同局多账号先合并，缺失详情不记为零。</p>`;
  }
  function rankingTable(rows,key,title,description,ico) {
    const content=rows.length?sortableTable('supply-'+key,courtHtml`<div class="table-wrap"><table class="supply-ranking"><thead><tr><th class="numeric">名次</th><th>朋友</th><th class="numeric">${description}</th><th class="numeric">完整详情 / 开黑局数</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="numeric mono ${r.rank===1?'yellow':''}">${r.rank}</td><td class="table-title">${friend(r)}</td><td class="numeric mono ${key==='avg_supplied_allies'?'positive':'cyan'}">${fmt(r[key],1)}</td><td class="numeric mono">${fmt(r.supply_matches)} / ${fmt(r.matches)}</td></tr>`).join('')}</tbody></table></div>`,rows,[
      {index:0,key:'rank',label:'名次',value:r=>r.rank,first:'asc'},
      {index:1,key:'name',label:courtText('朋友'),type:'text',value:r=>r.name},
      {index:2,key,label:description,value:r=>r[key]},
      {index:3,key:'samples',label:courtText('完整详情'),value:r=>r.supply_matches},
    ]):empty(courtText('暂无达到门槛的朋友'),courtHtml`至少 ${S.supplyMin} 局完整详情`,'',ico,true);
    return `<section class="supply-ranking-section"><div class="section-heading"><h2>${icon(ico)}${title}</h2><small>${description}</small></div>${content}</section>`;
  }
  function supplyView(data) {
    return courtHtml`<div class="analysis-controls"><label>补给榜最低完整局数<input id="supply-min" type="number" min="1" max="10000" step="1" value="${data.min_games}"></label><span class="hint">${data.eligible} / ${data.members.length} 位朋友达到门槛</span></div><div class="supply-rankings">${rankingTable(data.hungry,'avg_received_allies','小馋猫榜','场均消耗队友补给','utensils')}${rankingTable(data.transport,'avg_supplied_allies','运输大队长榜','场均补给队友','truck')}</div><div class="notice section-space">${icon('info')}按当前筛选下的完整开黑对局计算场均值；同一朋友同局多账号先合并。队友包含未登记的同队玩家，不代表只在朋友之间发生的补给。缺失详情不记零，完整详情中省略的零值按零计入；相同均值并列。</div>`;
  }
  return {performanceTabs,detailPerformance,supplyView};
}
