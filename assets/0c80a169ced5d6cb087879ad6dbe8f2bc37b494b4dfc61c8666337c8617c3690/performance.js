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
  function rankingTable(charge) {
    const {rows,key,title,label,icon:ico,direction,sample_label,format}=charge;
    const value=r=>r[key]==='Infinity'?'∞':format==='percent'?`${fmt(100*r[key],1)}%`:format==='signed'?`${r[key]>0?'+':''}${fmt(r[key],1)}`:fmt(r[key],['ratio','decimal2'].includes(format)?2:format==='integer'?0:1);
    const evidence=r=>charge.id==='kd'?`击毁 ${fmt(r.kills)} / 损失 ${fmt(r.units_lost)}`:charge.id==='kills'?`累计击杀分 ${fmt(r.destruction,1)}`:charge.id==='objectives'?`累计占点 ${fmt(r.objectives)}`:charge.id==='wins'?`${fmt(r.wins??0)} 胜 / ${fmt(r.losses_count??0)} 负`:charge.id==='losses'?`累计损失分 ${fmt(r.losses,1)}`:charge.id==='heavy_aa_kills'?`累计重防击杀 ${fmt(r.heavy_aa_kills)}${r.heavy_aa_kill_excluded?` · 分类或击杀异常排除 ${fmt(r.heavy_aa_kill_excluded)} 局`:''}`:'';
    const content=rows.length?sortableTable((charge.group==='mitigation'?'mitigation-':'charge-')+charge.id,courtHtml`<div class="table-wrap"><table class="supply-ranking"><thead><tr><th class="numeric">名次</th><th>朋友</th><th class="numeric">${esc(label)}</th><th class="numeric">${esc(sample_label)} / 开黑局数</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="numeric mono ${r.rank===1?'yellow':''}">${r.rank}</td><td class="table-title">${friend(r)}</td><td class="numeric mono">${value(r)}${evidence(r)?`<div class="table-sub">${esc(evidence(r))}</div>`:''}${charge.id==='heavy_aa_kills'&&r.heavy_aa_units.length?`<details class="heavy-aa-evidence"><summary>查看型号明细</summary>${r.heavy_aa_units.map(u=>`<div>${esc(u.name)} · 击杀 ${fmt(u.kills)} · 部署 ${fmt(u.deployments)} 次</div>`).join('')}</details>`:''}</td><td class="numeric mono">${fmt(r.sample_count)} / ${fmt(r.matches)}</td></tr>`).join('')}</tbody></table></div>`,rows,[
      {index:0,key:'rank',label:'名次',value:r=>r.rank,first:'asc'},
      {index:1,key:'name',label:courtText('朋友'),type:'text',value:r=>r.name},
      {index:2,key,label,value:r=>r[key],first:direction},
      {index:3,key:'samples',label:sample_label,value:r=>r.sample_count},
    ]):empty(courtText('暂无达到门槛的朋友'),`至少 ${S.supplyMin} 局${sample_label}；无有效比率时不排名`,'',ico,true);
    return `<section class="supply-ranking-section" data-charge="${esc(charge.id)}"><div class="section-heading charge-heading"><div><h3>${icon(ico)}${esc(title)}</h3><p class="charge-flavor">${esc(charge.subtitle)}</p></div><small>默认从${direction==='asc'?'少到多':'多到少'}</small></div>${content}${charge.id==='heavy_aa_kills'?'<p class="hint section-space">本人重防取得的总击杀 ÷ 有效单位详情局数，未出重防的有效对局也计入分母。按单位目录 role=15 识别全部型号，计入阵亡或退款前已取得的击杀；不代表击毁敌方重防或只击落飞机。</p>':''}</section>`;
  }
  function supplyView(data) {
    const groups=[['sentencing','判刑榜','单项证据 · 各罪分别排名'],['mitigation','减刑榜','后勤与防空 · 有功申请减刑']];
    const boards=groups.map(([id,title,description])=>`<section class="charge-group" data-charge-group="${id}" aria-label="${title}"><div class="section-heading charge-group-heading"><h2>${title}</h2><small>${description}</small></div><div class="supply-rankings">${(data.charges??[]).filter(charge=>charge.group===id).map(rankingTable).join('')}</div></section>`).join('');
    return courtHtml`<div class="section-heading"><h2>蘸饭罪名榜</h2><small>判刑与减刑 · 分榜排名</small></div><div class="analysis-controls"><label>罪名榜最低有效局数<input id="supply-min" type="number" min="1" max="10000" step="1" value="${data.min_games}"></label><span class="hint">${data.members.length} 位朋友有参战记录；各项按自己的有效样本判断门槛</span></div><div class="charge-boards">${boards}</div><div class="notice section-space">${icon('info')}同一朋友同局多账号先合并。补给、重防击杀与单位 K/D 使用完整详情；K/D 为击毁单位数 / 损失单位数，0 / 0 不排名。重防赎罪榜按本人重防取得的场均击杀排名，累计战果与型号可展开查看；单位分类缺失或击杀异常的对局从该项排除。击杀摸鱼罪按场均击杀分，占点旷工罪按场均占点；损失按损失分，胜率按已知胜负。缺失记录不记零，有效详情省略的零值按零计入；相同数值并列。各榜名次独立，不修改蘸饭刑期的计算方式。</div>`;
  }
  return {performanceTabs,detailPerformance,supplyView};
}
