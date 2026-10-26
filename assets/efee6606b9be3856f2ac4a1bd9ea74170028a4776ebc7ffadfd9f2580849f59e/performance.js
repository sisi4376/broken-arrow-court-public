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
  function selfMatchEvidence(m){
    const score=m.score===null?(m.known_score>0?`已知 ${fmt(m.known_score,1)} 分，另有待定`:'分数待定'):`${fmt(m.score,1)} 分`;
    const time=n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=8640000000000?esc(new Date(n*1000).toLocaleTimeString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'})):'未提供';
    return `<details class="self-match-evidence"><summary><a href="#match/${esc(m.match_id)}">#${esc(m.match_id)} · ${esc(m.map_name)}</a> · 确认 ${fmt(m.count)} 个 · ${score}${m.score_coverage==='partial'?' · 不参与场均':''}</summary><ul class="self-unit-list">${(m.units??[]).map(u=>`<li><div class="self-unit-heading"><strong>${esc(u.name)}</strong><span class="mono">${u.score===null?'价格待定':`${fmt(u.score,1)} 分`}</span></div><div class="self-unit-loadout">${u.loadout?.options?.length?u.loadout.options.map(o=>`${esc(o.slot)}：${esc(o.name)}`).join(' · '):u.option_ids.length?`未解析挂载：${esc(u.option_ids.join(', '))}`:'无挂载记录'}${u.loadout?.price_version?` · 版本 ${esc(u.loadout.price_version)}`:''}</div><small>账号 ${esc(u.player_id)} · 实例 ${esc(u.net_id)} · 击杀 ${fmt(u.kills)} · 伤害 ${fmt(u.damage,1)}<br>出场 ${time(u.spawn_time)} · 自毁时间 ${time(u.death_time)} · OptionIds: ${esc(u.option_ids.join(', ')||'—')}</small></li>`).join('')}</ul>${m.compatible?'<div class="hint">含旧格式兼容标记</div>':''}</details>`;
  }
  function unitEvidence(charge,r) {
    if(charge.id==='self_destruction'&&r.self_destruction_cases.length)return `<details class="heavy-aa-evidence"><summary>确认自毁对局 · ${fmt(r.self_destruction_cases.length)} 局</summary>${r.self_destruction_cases.map(selfMatchEvidence).join('')}</details>`;
    if(charge.id==='heavy_aa_kills'&&r.heavy_aa_units.length)return `<details class="heavy-aa-evidence"><summary>查看型号明细</summary>${r.heavy_aa_units.map(u=>`<div>${esc(u.name)} · 击杀 ${fmt(u.kills)} · 部署 ${fmt(u.deployments)} 次</div>`).join('')}</details>`;
    if(charge.id==='air_superiority'&&r.air_superiority_units.length)return `<details class="heavy-aa-evidence air-loadout-evidence"><summary>查看型号与实际挂载</summary>${r.air_superiority_units.map(u=>`<details class="air-loadout-row"><summary>${esc(u.name)} · 击杀 ${fmt(u.kills)} · 部署 ${fmt(u.deployments)} 次</summary><div>${u.loadout.map(s=>esc(s.replace(/^Custom_Option_/, '').replaceAll('_',' '))).join(' / ')||'基础武器'}</div><div class="mono">OptionIds: ${esc(u.option_ids.join(', '))}</div></details>`).join('')}</details>`;
    return '';
  }
  function selfCoveragePanel(data){
    const rows=data.members.filter(r=>r.self_destruction_score_excluded>0||r.self_destruction_score_samples<data.min_games&&r.self_destructions>0);
    const reasons={missing_detail:'缺少完整详情',invalid_flag:'自毁标记异常',missing_lifecycle:'旧战报缺少出场、死亡记录',missing_death_records:'单位死亡记录与损失汇总无法核对',missing_unit_price:'自毁兵牌的历史挂载价格待定'};
    return `<details class="section-space self-coverage"><summary>资料不完整与未达门槛记录 · ${fmt(rows.length)} 人</summary>${rows.map(r=>`<details class="section-space"><summary>${esc(r.name)} · 可核对 ${fmt(r.self_destruction_samples)} 局 · 可计分 ${fmt(r.self_destruction_score_samples)} 局 · 待核实 ${fmt(r.self_destruction_score_excluded)} 局 · 累计确认 ${fmt(r.self_destructions??0)} 个</summary>${r.self_destruction_score_samples<data.min_games?`<div class="hint">未达门槛；已确认记录仍保留。</div>${r.self_destruction_cases.filter(m=>m.score_coverage==='audited').map(selfMatchEvidence).join('')}`:''}${(r.self_destruction_unknown_cases??[]).map(m=>`<div class="section-space"><div>${esc(reasons[m.reason]??m.reason)} · ${m.count?`已确认至少 ${fmt(m.count)} 个`:'自毁数未知，不计零'}</div>${m.count?selfMatchEvidence(m):`<a href="#match/${esc(m.match_id)}">#${esc(m.match_id)} · ${esc(m.map_name)}</a>`}</div>`).join('')}</details>`).join('')}<p class="hint">${esc(data.self_destruction_model??'')} · 资料不足或自毁挂载价格待定的局不参与场均计分；确认的单位仍保留。</p></details>`;
  }
  function rankingTable(charge) {
    const {rows,key,title,label,icon:ico,direction,sample_label,format}=charge;
    const value=r=>r[key]==='Infinity'?'∞':format==='percent'?`${fmt(100*r[key],1)}%`:format==='signed'?`${r[key]>0?'+':''}${fmt(r[key],1)}`:fmt(r[key],['ratio','decimal2'].includes(format)?2:format==='integer'?0:1);
    const evidence=r=>charge.id==='kd'?`摧毁分 ${fmt(r.destruction,1)} / 损失分 ${fmt(r.losses,1)}`:charge.id==='kills'?`累计击杀分 ${fmt(r.destruction,1)}`:charge.id==='objectives'?`累计占点 ${fmt(r.objectives)}`:charge.id==='wins'?`${fmt(r.wins??0)} 胜 / ${fmt(r.losses_count??0)} 负`:charge.id==='losses'?`累计损失分 ${fmt(r.losses,1)}`:charge.id==='self_destruction'?`累计确认 ${fmt(r.self_destructions)} 个 · 已知损失 ${fmt(r.self_destruction_score,1)} 分 · 其中 ${fmt(r.self_destruction_score_ranked,1)} 分用于场均${r.self_destruction_unpriced_units?` · ${fmt(r.self_destruction_unpriced_units)} 个单位价格待定`:''}${r.self_destruction_score_excluded?` · ${fmt(r.self_destruction_score_excluded)} 局待核实`:''}`:charge.id==='heavy_aa_kills'?`累计重防击杀 ${fmt(r.heavy_aa_kills)}${r.heavy_aa_kill_excluded?` · 分类或击杀异常排除 ${fmt(r.heavy_aa_kill_excluded)} 局`:''}`:charge.id==='air_superiority'?`累计空优机击杀 ${fmt(r.air_superiority_kills)} · 挂载或数据不明排除 ${fmt(r.air_superiority_excluded)} 局`:'';
    const content=rows.length?sortableTable((charge.group==='mitigation'?'mitigation-':'charge-')+charge.id,courtHtml`<div class="table-wrap"><table class="supply-ranking"><thead><tr><th class="numeric">名次</th><th>朋友</th><th class="numeric">${esc(label)}</th><th class="numeric">${esc(sample_label)} / 开黑局数</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="numeric mono ${r.rank===1?'yellow':''}">${r.rank}</td><td class="table-title">${friend(r)}</td><td class="numeric mono">${value(r)}${evidence(r)?`<div class="table-sub">${esc(evidence(r))}</div>`:''}${unitEvidence(charge,r)}</td><td class="numeric mono">${fmt(r.sample_count)} / ${fmt(r.matches)}</td></tr>`).join('')}</tbody></table></div>`,rows,[
      {index:0,key:'rank',label:'名次',value:r=>r.rank,first:'asc'},
      {index:1,key:'name',label:courtText('朋友'),type:'text',value:r=>r.name},
      {index:2,key,label,value:r=>r[key],first:direction},
      {index:3,key:'samples',label:sample_label,value:r=>r.sample_count},
    ]):empty(courtText('暂无达到门槛的朋友'),`至少 ${S.supplyMin} 局${sample_label}；无有效比率时不排名`,'',ico,true);
    return `<section class="supply-ranking-section" data-charge="${esc(charge.id)}"><div class="section-heading charge-heading"><div><h3>${icon(ico)}${esc(title)}</h3><p class="charge-flavor">${esc(charge.subtitle)}</p></div><small>默认从${direction==='asc'?'少到多':'多到少'}</small></div>${content}${charge.id==='self_destruction'?'<p class="hint section-space">按场均自毁损失分排名：确认自毁单位的本局版本完整挂载价格之和 ÷ 有效计分对局数。无自毁的有效局也计入分母；价格待定或资料不全的整个人对局不参与场均，已确认兵牌及已知分仍保留。退款不计，普通自伤不推断自毁，旧格式兼容自身伤害 -1 且无死亡时间；不额外加刑。</p>':charge.id==='heavy_aa_kills'?'<p class="hint section-space">本人重防取得的总击杀 ÷ 有效单位详情局数，未出重防的有效对局也计入分母。按单位目录 role=15 识别全部型号，计入阵亡或退款前已取得的击杀；不代表击毁敌方重防或只击落飞机。</p>':charge.id==='air_superiority'?'<p class="hint section-space">按每次出场实际 OptionIds 筛选：固定翼、携带空空导弹（87/88），除机炮（116）外不带其他攻击武器。油箱、干扰吊舱可保留；对地、反辐射、混合挂载不计入。统计本人符合挂载的飞机总击杀，不等于击落敌机数。未出空优机的有效局也计入分母；无法确定挂载的本人对局整局排除，不补默认挂载。</p>':''}</section>`;
  }
  function supplyView(data) {
    const groups=[['sentencing','判刑榜','单项证据 · 各罪分别排名'],['mitigation','减刑榜','后勤与防空 · 有功申请减刑']];
    const boards=groups.map(([id,title,description])=>`<section class="charge-group" data-charge-group="${id}" aria-label="${title}"><div class="section-heading charge-group-heading"><h2>${title}</h2><small>${description}</small></div><div class="supply-rankings">${(data.charges??[]).filter(charge=>charge.group===id).map(c=>rankingTable(c)+(c.id==='self_destruction'?selfCoveragePanel(data):'')).join('')}</div></section>`).join('');
    return courtHtml`<div class="section-heading"><h2>蘸饭罪名榜</h2><small>判刑与减刑 · 分榜排名</small></div><div class="analysis-controls"><label>罪名榜最低有效局数<input id="supply-min" type="number" min="1" max="10000" step="1" value="${data.min_games}"></label><span class="hint">${data.members.length} 位朋友有参战记录；各项按自己的有效样本判断门槛</span></div><p class="hint">空优挂载目录：${esc(data.air_superiority_model?.version??'待载入')} · ${fmt(data.air_superiority_model?.units??0)} 种飞机 · ${esc(data.air_superiority_model?.db_file??'尚未建立目录')}。${data.air_superiority_model?.units?'未知历史挂载不猜测、不记零。':'挂载资料未就绪时，相关对局暂不参与空优榜。'}</p><div class="charge-boards">${boards}</div><div class="notice section-space">${icon('info')}同一朋友同局多账号先合并。KD失职罪按累计摧毁分 / 累计损失分排名，与被告表现的分数交换比一致，不取逐局比率的平均值；有分数记录的摘要局也计入，0 / 0 不排名，有摧毁分但无损失分显示 ∞。补给、重防、空优机击杀使用完整详情；重防与空优榜按本人单位取得的场均击杀排名，空优进一步按实际挂载筛选。击杀摸鱼罪按场均击杀分，占点旷工罪按场均占点；损失按损失分，胜率按已知胜负。缺失记录不记零，有效详情省略的零值按零计入；相同数值并列。各榜名次独立，不修改蘸饭刑期的计算方式。</div>`;
  }
  return {performanceTabs,detailPerformance,supplyView};
}
