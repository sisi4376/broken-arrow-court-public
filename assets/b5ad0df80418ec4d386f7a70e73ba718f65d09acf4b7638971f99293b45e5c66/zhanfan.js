import { courtText, courtHtml } from './court-ui.js';
import { sortableTable } from './table-sort.js';

export function createCourt({S,esc,icon,fmt,empty,readOnly=false}) {
  const months=n=>n===null||n===undefined?'—':n>=240?'无期徒刑':`${Math.floor(n/12)} 年 ${n%12} 个月`;
  const flavor=r=>r.eligible?r.flavor:r.scored_matches?'战报还没凑齐，先别急着领饭勺。':r.flavor;
  const tone=r=>r.score===null?'muted':r.sentence_months===0?'positive':r.score>=55?'negative':'yellow';
  const viewModes=mode=>{if(readOnly)return '';const selected=mode==='cases'?'cases':'current';return `<div class="segmented court-view-modes" aria-label="量刑版本">${[['current','现行判决'],['cases','案例复核']].map(([key,label])=>`<button data-court-view="${key}" class="${selected===key?'active':''}" aria-pressed="${selected===key}">${label}</button>`).join('')}</div>`;};
  const sign=(n,d=1)=>n===null?'—':`${n>0?'+':''}${fmt(n,d)}`;
  const foodPoints=r=>{const n=r.components.find(c=>c.key==='dependency')?.points;return n>0&&n<.01?'<0.01':fmt(n,2);};
  const primaryPenalty=r=>r.components.filter(c=>Number.isFinite(c.change)&&c.change>=1).sort((a,b)=>b.change-a.change)[0];
  function contextEvidence(r) {
    if(!r.context||!r.scored_matches)return '';
    if(r.context.mode==='independent')return independentEvidenceView(r);
    const c=r.context,examples=[...new Map([...c.risk_examples,...c.relief_examples].map(e=>[e.match_id,e])).values()];
    return `<details class="court-trial-evidence"><summary>逐局依据与减刑记录</summary><p>可见贡献不足 ${c.imbalanced_matches} / ${r.scored_matches} 局；低贡献叠加负交换 ${c.exchange_matches} 局；蹭补给罚分触发 ${r.freeloading.penalized_matches} 局。占点缓解 ${c.objective_relief_matches} 局，重防 / 空优战果缓解 ${c.specialist_relief_matches} 局。</p><p>场均净消耗队友补给 ${fmt(r.freeloading.net_received/r.scored_matches,1)}；补给项最终 ${foodPoints(r)} / 15。下列为原始个人行为罚分较高的最多三局及贡献缓解最多两局，并非人工认定。</p>${examples.map(e=>`<div class="court-context-example"><a href="#match/${esc(e.match_id)}">#${esc(e.match_id)}</a><span>可见贡献达成 ${fmt(e.contribution*100,1)}% · 不足程度 ${fmt(e.deficit*100,1)}% · 个人行为原始罚分 ${fmt(e.points,2)} / 75</span><span>摧毁 / 损失 ${fmt(e.values.destruction)} / ${fmt(e.values.losses)} · 占点 ${fmt(e.values.objectives)} · 净吃补给 ${fmt(e.net_received)}（${fmt(e.supply_share*100,1)}%）</span><span>战斗达成 ${fmt(e.combat*100,1)}% · 占点达成 ${fmt(e.objectives*100,1)}% · 专职战果达成 ${fmt(e.specialist*100,1)}%${e.unavailable_specialists?' · 部分专职证据未知':''}</span><span>占点缓解不足程度 ${fmt(e.objective_relief,1)} 个百分点 · 专职战果缓解 ${fmt(e.specialist_relief,1)} 个百分点</span></div>`).join('')}<p>未记录的视野、守点与战术牺牲不是零贡献；分数只描述归档中可观察的失衡，不能判定本人导致输赢或故意蹭饭。</p></details>`;
  }
  function contextComparison(data) {
    const term=r=>r.eligible?r.sentence:r.scored_matches?`暂估：${r.sentence}`:r.status;
    const version=model=>esc(model.version.split('-')[1]);
    const change=r=>!r.comparable?'样本不足':r.previous.life&&r.current.life?'均为无期':r.previous.life?'无期改有期':r.current.life?'有期改无期':`${r.delta_months>0?'增加':r.delta_months<0?'减少':'不变'}${r.delta_months?' '+Math.abs(r.delta_months)+' 个月':''}`;
    const table=sortableTable('court-context-comparison',courtHtml`<div class="table-wrap"><table class="court-comparison"><thead><tr><th>朋友</th><th>旧版 ${version(data.previous.model)} 刑期</th><th>现行 ${version(data.current.model)} 刑期</th><th>刑期变化</th><th class="numeric">旧版 / 现行指数</th><th class="numeric">可评估局数</th><th>现行依据</th></tr></thead><tbody>${data.members.map(r=>`<tr><td class="table-title"><a href="#friend/${r.member_id}">${esc(r.name)}</a></td><td>${esc(term(r.previous))}</td><td class="${tone(r.current)}">${esc(term(r.current))}</td><td>${esc(change(r))}</td><td class="numeric mono">${fmt(r.previous.score,1)} / ${fmt(r.current.score,1)}</td><td class="numeric mono">${r.previous.scored_matches} / ${r.current.scored_matches}</td><td class="court-trial-reason">${reasons(r.current)}${contextEvidence(r.current)}</td></tr>`).join('')}</tbody></table></div>`,data.members,[
      {index:0,key:'name',label:courtText('朋友'),type:'text',value:r=>r.name},
      {index:1,key:'old',label:'旧版刑期',value:r=>r.previous.eligible?r.previous.sentence_months:null},
      {index:2,key:'new',label:'现行刑期',value:r=>r.current.eligible?r.current.sentence_months:null},
      {index:3,key:'change',label:'刑期变化',value:r=>r.delta_months},
      {index:5,key:'samples',label:'可评估局数',value:r=>r.current.scored_matches},
    ]);
    return courtHtml`${viewModes(true)}<div class="section-heading"><h2>新旧判决对照</h2><small>现行 ${version(data.current.model)} · 旧版 ${version(data.previous.model)} 留档</small></div><div class="analysis-controls"><label>蘸饭榜最低可评估局数<input id="court-min" type="number" min="1" max="10000" step="1" value="${data.min_games}"></label></div><p class="notice">${icon('scale')}相同筛选和归档重新计算。${data.current.model.context?.score_floor<0?rankingNotice(data.current.model):data.current.model.context?.score_cap?'v7 战斗、交换单项上限150，按60%/40%组成核心，最终指数仍封顶100；没有另加超过中性的重复罚分。胜负±10、补给最多+8、友伤最多+4，样本收缩保留。':data.current.model.aggregation?'v6 核心分独占 0～100，胜负仅作 ±10 分修正，补给最多 +8、友伤最多 +4。高分不再要求额外负面行为凑齐；样本收缩保留。':data.current.model.context.scale==='independent'?'v5 的战斗兑现与交换独立计分，不再共同乘贡献缺口。指数 42.5 是无额外加减项时的中性参照，不等于无罪；25 分及以下免刑，具体参照见判决规则。':'新版直接以失衡罚分作为指数，不再用旧版的放大刻度。'}差额反映规则变化，不代表玩家突然变强。缺少可用活动证据的对局不评分。</p>${table}${rules(data.current.model)}`;
  }
  function contextRules(model) {
    if(model.aggregation)return coreRules(model);
    if(model.context.scale==='independent')return independentRules(model);
    const r=model.context;
    return courtHtml`<details class="court-rules"><summary>判决规则与资料 · ${esc(model.version)}</summary><div class="court-rules-body">
      <p>朋友间自定义娱乐判决，不是官方实力评级。以下权重与容忍线是公开设计选择，未经过人工标签或胜负预测验证；不按名单、名次或分布重新拟合。</p>
      <p>先合并同一人的多账号，仅与同局其他同队真人比较。战斗达成 = 60% × min(1, (本人摧毁 + ${r.destruction_buffer}) / (其他队友人均摧毁 + ${r.destruction_buffer})) + 40% × min(1, (本人伤害 + ${r.damage_buffer}) / (其他队友人均伤害 + ${r.damage_buffer}))。</p>
      <p>占点达成 = min(1, 本人占点 / (其他队友人均占点 + ${r.objectives_buffer}))。重防与实际纯空优挂载分别计算：${r.specialist_cap} × min(1, 本人该类单位击杀 / (其他队友人均该类击杀 + ${r.specialist_buffer}))，取较高者，不叠加、不当作击落敌机数；该类任一同队真人分类不明时不使用该类证据。</p>
      <p>先以战斗达成 B 计算缺口 D₀ = max(0, (${r.adequate} − B) / ${r.adequate})；80% 为容忍线，零占点不单独扣分。再取战斗、占点、专职战果中的最高达成 R，计算可缓解缺口 D₀ − max(0, (${r.adequate} − R) / ${r.adequate})。占点与专职缓解取较有利的一条，不叠加，最多缓解原缺口 ${fmt(r.relief_limit*100,0)}%；最终不足程度 D 为缓解后的剩余缺口。页面有效贡献达成为 0.8 × (1 − D)，原战斗已达标则保留 B。</p>
      <p>这个上限是因为占点次数没有控制时长，专职总击杀没有战术归因：能减刑，不能仅靠一次占点、出了一架飞机就全部免罪。占点加 ${r.objectives_buffer} 平滑，一次占点在其他队友为零时也不记满。缺少视野、守点时长和战术意图仍会产生误差。</p>
      <dl><dt>可见贡献不足 · 35%</dt><dd>单局罚分 100 × D，反映可观察的同队贡献缺口。</dd>
      <dt>低效战损 · 20%</dt><dd>100 × max(损失 − 摧毁, 0) / (损失 + ${r.destruction_buffer}) × D。只有负交换与贡献不足重叠才罚，不能把正常推进的战损单独算罪。</dd>
      <dt>蹭队友补给 · 15%</dt><dd>净消耗 = max(从队友补给 − 补给队友, 0)，比例 S = 净消耗 / max(自身消耗补给, 从队友补给, ${r.supply_buffer})。单局罚分 = 100 × max(0, (S − ${r.free_supply_share}) / (1 − ${r.free_supply_share})) × D。比例不超过 ${fmt(r.free_supply_share*100,0)}% 或无贡献缺口则不罚；只抵扣同局净消耗，不跨局抵账，不把补给数量与摧毁价值相加，不另奖送补给。</dd>
      <dt>长期胜负 · 25%</dt><dd>明确败局记 100，胜局记 0，未知胜负不计输。它有重要影响，但不是个人输赢归因，也不能抹掉另外 75% 的行为证据。</dd>
      <dt>友伤约束 · 5%</dt><dd>100 × min(1, 友伤 / (伤害 + 友伤 + 50) / ${r.friendly_fire_limit})，不推断是否故意。</dd></dl>
      <p>各局等权平均，不累计服刑；偶发失衡被正常场次稀释，持续失衡的比例越高影响越大。个人四项各以 n / (n + ${model.prior_games}) 向无加刑证据的 0 收缩；胜负用明确结果的 k 局独立向 50 收缩。原始总分直接作为指数，没有分布拉伸。无样本待取证；默认至少 5 局才排名；全队没有可见活动证据、缺详情、非法字段或队伍不明不评分。未知专职证据不当作零击杀，也不因此单独加刑。</p>
      <p>指数 ≤ ${model.sentencing.acquittal_score} 当庭释放；超线刑期月数 = max(1, round(240 × ((指数 − 25) / 60)<sup>1.4</sup>))，封顶 360 月。85 分对应 20 年，20 年及以上显示无期；同为无期按指数排序。保留免刑线和旧版刑期函数，不强制有人有罪。</p>
      <p>权重扰动范围仅分别将各项权重上下调整 20% 后重新归一化，不是置信区间。完整对局数是数据覆盖，不是判决准确率。补给任务、侦察、激光协同、守点与牺牲推进仍需回放解释；模型分数不能替代这些证据。</p>
      <div class="court-sentence-bands"><h3>本庭量刑小字</h3>${model.sentence_bands.map(b=>`<p><b>${esc(b.name)}</b> · ${esc(b.flavor)}</p>`).join('')}</div>
      <p>方法参考 ${model.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>`).join(' · ')}。这些资料不为本项目的权重或具体刑期背书。</p>
    </div></details>`;
  }
  function independentEvidenceView(r) {
    if(r.score_breakdown)return coreEvidenceView(r);
    const c=r.context,examples=[...new Map([...c.risk_examples,...c.relief_examples].map(e=>[e.match_id,e])).values()];
    return `<details class="court-trial-evidence"><summary>逐局依据与减刑记录</summary><p>战斗罚分高于中性 ${c.imbalanced_matches} / ${r.scored_matches} 局；交换罚分高于中性 ${c.exchange_matches} 局；蹭补给触发 ${r.freeloading.penalized_matches} 局。占点减刑 ${c.objective_relief_matches} 局，重防 / 空优战果减刑 ${c.specialist_relief_matches} 局。</p><p>场均净消耗队友补给 ${fmt(r.freeloading.net_received/r.scored_matches,1)}；补给项最终 ${foodPoints(r)} / 10。以下为个人行为罚分较高的最多三局及贡献缓解最多两局，不是人工标签。</p>${examples.map(e=>`<div class="court-context-example"><a href="#match/${esc(e.match_id)}">#${esc(e.match_id)}</a><span>战斗罚分 ${fmt(e.combat_base,1)} → ${fmt(e.combat_penalty,1)} · 交换罚分 ${fmt(e.exchange_base,1)} → ${fmt(e.exchange_penalty,1)}（各 0～100）</span><span>占点 / 专职减免 ${fmt(e.support_credit,1)} 点分项罚分，不叠加；两项合计少 ${fmt(e.relief_points,2)} 点原始综合罚分</span><span>摧毁 / 损失 ${fmt(e.values.destruction)} / ${fmt(e.values.losses)} · 伤害 ${fmt(e.values.damage)} · 占点 ${fmt(e.values.objectives)}</span><span>其他同队人均：摧毁 ${fmt(e.references.destruction,1)} · 伤害 ${fmt(e.references.damage,1)} · 占点 ${fmt(e.references.objectives,2)}</span><span>净吃补给 ${fmt(e.net_received)}（${fmt(e.supply_share*100,1)}%） · 补给单局罚分 ${fmt(e.penalties.dependency,1)} / 100 · 个人行为合计 ${fmt(e.points,2)} / 75${e.unavailable_specialists?' · 部分专职证据未知':''}</span></div>`).join('')}<p>战斗、交换分别计基础分，胜负单独汇总。视野、守点与牺牲未完整记录，罚分和减免仅为娱乐规则，不是个人导致输赢的结论。</p></details>`;
  }
  function independentRules(model) {
    const r=model.context;
    return courtHtml`<details class="court-rules"><summary>判决规则与资料 · ${esc(model.version)}</summary><div class="court-rules-body">
      <p>朋友间自定义娱乐判决，不是官方实力评级，也未经过人工标签或预测验证。指数不是犯罪概率；中性表现并不自动免刑。常数和参照先于本次档案回算确定，不按朋友名单或分数分布重拟合。</p>
      <p>统一量尺 P = clamp(50 − ${r.slope} × log₂((本人值 + b) / (参考值 + b)), 0, 100)。缓冲后比例 4 倍、2 倍、相等、1/2、1/4 倍，分别对应罚分 0、25、50、75、100。双零为中性 50，不凭缺少比较信息定为最差。</p>
      <dl><dt>战斗兑现 · 35%</dt><dd>击杀价值罚分 × 60% + 伤害罚分 × 40%；分别对比其他同队真人人均值，缓冲 b 为 ${r.destruction_buffer}、${r.damage_buffer}。多账号先按人合并，参考排除本人，不与敌方或跨地图总量比较。</dd>
      <dt>战损交换 · 25%</dt><dd>将本人摧毁分与本人损失分代入相同量尺，b=${r.destruction_buffer}。该项独立计算，不因战斗达标就清零；正交换可以降低罚分，负交换也不直接认定为故意送兵。</dd>
      <dt>占点 / 专职有限减刑</dt><dd>占点信用 = ${r.relief_cap} × clamp((本人占点 − 其他队友人均占点) / (其他队友人均占点 + ${r.objectives_buffer}), 0, 1)。重防、实际纯空优挂载也按本人单位击杀与队友同类人均值计算，缓冲 ${r.specialist_buffer}。只取最有利的一条信用，不叠加；分别从战斗和交换罚分扣除，最多各 ${r.relief_cap} 点，不低于 0。两项基础综合罚分最多减 12 分；若使战斗达标，还可能降低补给额外罚分。不因出过某种单位就减刑；分类不明不当作零击杀。</dd>
      <dt>蹭队友补给 · 10%</dt><dd>净消耗 N=max(从队友补给 − 补给队友, 0)，依赖 S=N/max(自身消耗补给, 从队友补给, ${r.supply_buffer})。单局罚分=100 × clamp((S−${r.free_supply_share})/(1−${r.free_supply_share}),0,1) × clamp((减刑后战斗罚分−50)/50,0,1)。只有超过 35% 依赖且战斗罚分高于中性才加刑；胜负和交换不参与这个条件。不送补给不罚，不额外奖励送补给，不跨局抵账，不混加不同资源单位。</dd>
      <dt>长期胜负 · 25%</dt><dd>明确胜局记 0、败局记 100，未知不计输。只衡量共同结果，不替代个人证据；赢局不能抹掉其他 75% 的罚分。</dd>
      <dt>友伤约束 · 5%</dt><dd>100 × min(1, 友伤/(伤害+友伤+50)/${r.friendly_fire_limit})，不推断故意。</dd></dl>
      <p>各局等权平均，不累计服刑。基础战斗、交换和胜负向 50 收缩，补给与友伤向 0 收缩，n/(n+${model.prior_games}) 为样本权重；胜负只用明确结果的 k 局独立收缩。先验综合 42.5 分，不是没数据就判刑：无样本待取证，默认至少 5 局才排名，低于 20 局为初步结果。原始加权罚分直接作为指数，无分布放大。</p>
      <h3>固定量刑参照</h3><p>以下是长期均值参照，使用缓冲后的比例，且无占点/专职信用、额外补给或友伤罚分；不是当前朋友内部名次。25 分免刑线对应“双倍产出与双倍交换、60% 胜率”的优势参照，而非中性 42.5 分。</p>
      <div class="table-wrap"><table><thead><tr><th>参照条件</th><th class="numeric">指数</th><th>娱乐刑期</th></tr></thead><tbody>${model.benchmarks.map(b=>`<tr><td>${esc(b.name)}</td><td class="numeric mono">${fmt(b.score,1)}</td><td>${b.sentence_months===0?'当庭释放':months(b.sentence_months)}</td></tr>`).join('')}</tbody></table></div>
      <p>指数 ≤25 当庭释放；超线月数=max(1, round(240×((指数−25)/60)<sup>1.4</sup>))，封顶 360 月。85 分对应 20 年，20 年及以上为无期。权重扰动仅是敏感性范围，不是置信区间；数据覆盖不等于判决准确率。</p>
      <p>缺详情、队伍不明、无同队参考、非法必要字段、无效时长和全队无可见活动不评分。完整 protobuf 省略标量零按零，显式未知不补零。占点不是控制时长，专职战果不是敌机击落数，未记录的侦察、威慑、协同和战术牺牲仍需回放解释。</p>
      <div class="court-sentence-bands"><h3>本庭量刑小字</h3>${model.sentence_bands.map(b=>`<p><b>${esc(b.name)}</b> · ${esc(b.flavor)}</p>`).join('')}</div>
    </div></details>`;
  }
  function reviewView(data) {
    const o=data.overview,values=r=>{
      const v=r.values;return [['摧毁 / 损失价值',`${fmt(v.destruction)} / ${fmt(v.losses)}`],['净交换',fmt(r.net_exchange)],['占点次数',fmt(v.objectives)],
        ['自身消耗补给',fmt(v.consumed)],['从队友 / 补给队友',`${fmt(v.received)} / ${fmt(v.supplied)}`],['净消耗队友补给',fmt(r.net_received)],
        ['重防 / 空优单位战果',`${fmt(r.heavy_kills)} / ${fmt(r.air_kills)}`],['伤害 / 友伤伤害',`${fmt(v.damage)} / ${fmt(v.friendly_fire)}`]];
    };
    const evidence=r=>`<article class="court-review-case"><div class="section-heading"><div><a class="table-title" href="#friend/${r.member_id}">${esc(r.name)}</a> · <a href="#match/${r.match_id}">#${esc(r.match_id)}</a><div class="table-sub">${esc(r.map_name)} · ${r.end_time?esc(new Date(r.end_time*1000).toLocaleDateString('zh-CN',{timeZone:'Asia/Hong_Kong'})):'日期未知'} · ${r.won===null?'胜负未知':r.won?'胜利':'失败'} · ${r.player_ids.length} 个账号合并</div></div><span class="badge muted">${esc(r.status)}</span></div><dl class="court-review-facts">${values(r).map(([label,value])=>`<div><dt>${esc(label)}</dt><dd class="mono">${esc(value)}</dd></div>`).join('')}</dl><details class="court-review-detail"><summary>同队真人与出场单位</summary><div class="table-wrap"><table><thead><tr><th>同队真人</th><th class="numeric">摧毁 / 损失价值</th><th class="numeric">占点</th><th class="numeric">从队友 / 补给队友</th></tr></thead><tbody>${r.peers.map(p=>`<tr><td>${esc(p.name)}${p.member_id===r.member_id?'（本人）':''}</td><td class="numeric mono">${fmt(p.values.destruction)} / ${fmt(p.values.losses)}</td><td class="numeric mono">${fmt(p.values.objectives)}</td><td class="numeric mono">${fmt(p.values.received)} / ${fmt(p.values.supplied)}</td></tr>`).join('')}</tbody></table></div><p class="hint">派兵价值 ${fmt(r.values.spawned)} · 回收价值 ${fmt(r.values.refunded)}；不直接等同资源净成本，也不与补给数相加。</p><div class="court-review-units">${r.models.map(u=>`<div><span>${esc(u.name)}</span><span>出场 ${u.deployments} 次 · 总击杀 ${fmt(u.kills)}</span></div>`).join('')||'<span>未记录单位实例</span>'}</div><p class="hint">出场记录不等于实际职责；重防与空优战果不等于击落敌机数量，未知分类保持未知。</p></details></article>`;
    return courtHtml`${viewModes('cases')}<div class="section-heading"><h2>对局案例复核</h2><small>证据清单 · 不生成新刑期</small></div><p class="hint">${o.matches} 场符合筛选 · 完整 ${o.complete} 场 · 缺详情 ${o.missing} 场 · ${o.person_matches} 人局 · 选取 ${o.selected} 个不同人局 · 人工确认 ${o.confirmed_labels} 个</p><p class="notice">${icon('file-search')}低战果不直接判无贡献，赢局不直接判有功。下列条件只用于找案例，不是蘸饭标准。每类按单项数值选取最多三位不同朋友，各取一局；不是随机代表性样本，不能据此估计误判率或拟合刑期。</p>${data.categories.map((c,i)=>`<section class="court-review-section"><details class="court-review-category" data-review-category="${esc(c.id)}" ${i===0?'open':''}><summary>${esc(c.title)}<small>${c.candidates} 人局符合选样条件 · 展示 ${c.cases.length} 个</small></summary><p class="court-review-question">${esc(c.question)}</p><p class="hint">${esc(c.limitation)}</p>${c.cases.length?c.cases.map(evidence).join(''):empty('暂无符合选样条件的案例','','','files',true)}</details></section>`).join('')}<section class="court-review-section"><h3>仍缺少的证据</h3><ul>${data.limitations.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><p class="hint">目前没有公认的人工标签，不把这些案例自动标成蘸饭或非蘸饭。此页只展示事实，不改写现行模型；娱乐判决和历史版本可在现行判决及新旧对照中查看。不能把代码测试通过当作评分有效性验证。</p></section>`;
  }
  function comparisonView(data) {
    const model=data.trial.model;
    const term=r=>r.eligible?r.sentence:r.scored_matches?`暂估：${r.sentence}`:r.status;
    const diff=r=>!r.comparable?'样本不足':r.previous.life&&r.trial.life?'均为无期，按指数比较':r.previous.life?'无期改有期':r.trial.life?'有期改无期':r.delta_previous_months===0?'刑期不变':`${r.delta_previous_months>0?'增加':'减少'} ${Math.abs(r.delta_previous_months)} 个月`;
    const evidence=r=>`<details class="court-trial-evidence"><summary>量刑分项</summary><div class="court-trial-parts">${r.trial.components.map(c=>`<div><span>${esc(c.name)} · ${c.weight}%</span><b>${fmt(c.points,2)} / ${c.weight}</b></div>`).join('')}</div><p>场均净消耗队友补给 ${r.trial.scored_matches?fmt(r.trial.freeloading.net_received/r.trial.scored_matches,1):'—'}；净依赖超线 ${r.trial.freeloading.dependent_matches} 局，其中低贡献触发罚分 ${r.trial.freeloading.penalized_matches} 局。未触发不是缺失值，触发也不是整局记满。</p><p>专长补偿 ${r.trial.specialist.credited_matches} / ${r.trial.scored_matches} 局；战斗项原始罚分减免 ${r.trial.scored_matches?fmt(r.trial.specialist.credit_sum/(r.trial.scored_matches+model.prior_games)*model.dimensions.find(d=>d.key==='output').weight/100,2):'—'}。无可用专长依据 ${r.trial.specialist.unavailable_matches} 局，保留基础评分。</p><p>相对中性基线的分项变化（原始罚分，非刑期）：${r.drivers.map(d=>`${esc(d.name)} ${sign(d.delta)}`).join('；')}。</p></details>`;
    const table=data.members.length?sortableTable('court-ratio-comparison',courtHtml`<div class="table-wrap"><table class="court-comparison"><thead><tr><th>朋友 / 现行判决</th><th>上版试算刑期</th><th>比值试算刑期</th><th>较上版刑期变化</th><th class="numeric">上版 / 比值指数</th><th class="numeric">较上版指数变化</th><th class="numeric">同批评分局数</th><th>比值版依据</th></tr></thead><tbody>${data.members.map(r=>{
      const positive=r.trial.components.filter(c=>c.change>0.05).sort((a,b)=>b.change-a.change)[0],negative=r.trial.components.filter(c=>c.change< -0.05).sort((a,b)=>a.change-b.change)[0];
      return `<tr><td class="table-title"><a href="#friend/${r.member_id}">${esc(r.name)}</a><div class="table-sub">现行：${esc(term(r.current))}</div><div class="table-sub">上版 #${r.previous.rank??'—'} · 比值 #${r.trial.rank??'—'}</div></td><td>${esc(term(r.previous))}</td><td class="${tone(r.trial)}">${esc(term(r.trial))}</td><td class="${r.delta_previous_score===null?'muted':r.delta_previous_score<0?'positive':r.delta_previous_score>0?'negative':'muted'}">${esc(diff(r))}</td><td class="numeric mono">${fmt(r.previous.score,1)} / ${fmt(r.trial.score,1)}</td><td class="numeric mono">${sign(r.delta_previous_score)}</td><td class="numeric mono">${r.trial.scored_matches}</td><td class="court-trial-reason"><div>加刑：${positive?esc(positive.name):'无明显短板'}</div><div>减刑：${negative?esc(negative.name):'无明显优势'}</div><div>蹭饭罚分 ${esc(foodPoints(r.trial))} / ${model.dimensions.find(c=>c.key==='dependency').weight} · 触发 ${r.trial.freeloading.penalized_matches} / ${r.trial.scored_matches} 局</div>${evidence(r)}</td></tr>`;
    }).join('')}</tbody></table></div>`,data.members,[
      {index:0,key:'name',label:courtText('朋友'),type:'text',value:r=>r.name},
      {index:1,key:'previous',label:'上版试算刑期',value:r=>r.previous.eligible?r.previous.sentence_months:null},
      {index:2,key:'trial',label:'比值试算刑期',value:r=>r.trial.eligible?r.trial.sentence_months:null},
      {index:3,key:'months',label:'较上版刑期变化',value:r=>r.previous.life&&r.trial.life?null:r.delta_previous_months},
      {index:5,key:'delta',label:'较上版指数变化',value:r=>r.delta_previous_score},
      {index:6,key:'samples',label:'同批评分局数',value:r=>r.current.scored_matches},
    ]):empty('暂无对照记录','','','scale',true);
    return courtHtml`${viewModes(true)}<div class="section-heading"><h2>新旧量刑试算</h2><small>草案 · 未替换现行判决</small></div><div class="analysis-controls"><label>蘸饭榜最低可评估局数<input id="court-min" type="number" min="1" max="10000" step="1" value="${data.min_games}"></label><span class="hint">${data.summary.comparable} 人可对照 · 较上版指数上升 ${data.summary.previous_increased} · 下降 ${data.summary.previous_decreased} · 不变 ${data.summary.previous_unchanged}</span></div><p class="hint">上版范围 ${fmt(data.ranges.previous.min,1)}～${fmt(data.ranges.previous.max,1)} · 标准差 ${fmt(data.ranges.previous.sd,2)}；比值版范围 ${fmt(data.ranges.trial.min,1)}～${fmt(data.ranges.trial.max,1)} · 标准差 ${fmt(data.ranges.trial.sd,2)}。同批上榜样本，标准差仅描述分散程度。</p><p class="hint">后勤只评蹭饭：不送补给不扣分，净依赖超线且贡献不足才加刑；送补给仅抵扣同局净消耗，不额外奖励。</p>${table}${comparisonRules(data)}`;
  }
  function comparisonRules(data) {
    const model=data.trial.model,r=model.ratio;
    return courtHtml`<details class="court-rules"><summary>试算规则 · ${esc(model.version)}</summary><div class="court-rules-body">
      <p>正式 ${esc(data.current.model.version)} 不变，上一版 ${esc(data.previous.model.version)} 保留。本次只更换战损交换、战斗产出与占点的量尺；三版使用相同筛选、同批有效对局，个人页仍显示正式判决。</p>
      <p>${model.dimensions.map(d=>`${esc(d.name)} ${d.weight}%`).join('；')}。与上一版权重相同，胜负、友伤、蹭饭证据、小样本收缩、固定刻度与刑期函数不变。</p>
      <p>比值罚分 = clamp(50 − ${r.slope} × log₂((本人值 + 平滑常数) / (参考值 + 平滑常数)), 0, 100)。交换参考本人损失分，平滑常数 ${model.exchange_buffer}；战斗与占点参考同局其他同队真人的人均值，合并多账号后排除本人。击杀价值平滑 ${r.destruction_buffer}、伤害 ${r.damage_buffer}、占点 ${r.objectives_buffer}，本版本固定，不按朋友名单或名次重新拟合。双方为零记中性 50。</p>
      <p>战斗基础罚分 = 击杀价值比值罚分 × 60% + 伤害比值罚分 × 40%。原有重防、实际空优挂载专长补偿不叠加，上限 ${model.combat.support_percentile_cap} 分（战斗项最多减 3 点原始罚分），不越过 0～100 边界。它统计本人单位总战果，不代表击落敌机数；证据不明的专长不参与比较。</p>
      <p>蹭饭完全复用上一版证据：净消耗 = max(从队友补给 − 补给队友, 0)；净依赖比例 = 净消耗 / max(自身消耗补给, 从队友补给, ${model.supply_buffer})。超过 ${fmt(model.freeloading.free_share*100,0)}% 且原百分位贡献低于 ${model.freeloading.contribution_cutoff} 才有罚分；原贡献取占点百分位与含专长补偿的战斗百分位较高者，不改用新比值分，以隔离本次量尺实验。单局罚分 = 100 × max(0, (比例 − ${model.freeloading.free_share}) / (1 − ${model.freeloading.free_share})) × max(0, (${model.freeloading.contribution_cutoff} − 原贡献) / ${model.freeloading.contribution_cutoff})，再按同样方式平均收缩、乘 14% 权重。不能跨局抵账。</p>
      <p>中性原始基线 ${model.raw_baseline} 对应指数 ${model.baseline}；25 分及以下当庭释放，85 分对应 20 年无期。没有按当前人员名单强制摊开分数。平滑常数、斜率和蹭饭阈值均是试算设计，未经过预测验证，不代表官方实力评级。</p>
      <p>分项变化指相对上一版的原始罚分差，不是独立因果效应，不能直接相加为月数。有限的归档指标不能完整衡量视野、防空威慑和战术牺牲。</p>
    </div></details>`;
  }
  function rules(model) {
    if(model.context)return contextRules(model);
    const weight=key=>model.dimensions.find(d=>d.key===key).weight,rule=model.sentencing;
    return courtHtml`<details class="court-rules"><summary>判决规则与资料 · ${esc(model.version)}</summary><div class="court-rules-body">
      <p>纯属朋友间的游戏娱乐，不是官方实力评级，也不是真实刑罚。权重和阈值为本项目自定义，未经胜负预测校准。</p>
      <p>个人表现每局仅与同队真人比较，朋友多账号先合并。百分位 = (低于自己的个数 + 同值个数的一半) / 同队人数。不同日期、地图、模式不直接比较原始分数；不以多玩累计加刑。</p>
      <dl><dt>战损交换 · ${weight('exchange')}%</dt><dd>(摧毁分 − 损失分) / (摧毁分 + 损失分 + 500)，再取同队百分位。</dd>
      <dt>战斗 / 后勤产出 · ${weight('output')}%</dt><dd>每分钟伤害与每分钟补给队友，取较高百分位；没有补给时，后勤百分位为 0。</dd>
      <dt>占点 / 支援贡献 · ${weight('contribution')}%</dt><dd>每分钟占点与每分钟补给队友，取较高百分位。后勤在两项中提供补偿，但不能免除交换、友伤等项。</dd>
      <dt>胜负表现 · ${weight('victory')}%</dt><dd>有效开黑局的失败率：赢一局记 0，输一局记 100。胜负明确的 k 局独立向 50% 收缩，罚分 = (败局数 + 5) / (k + 10) × 100。胜负未知不计输、不增加 k，全部未知时本项保留 50 分基线。团队结果只是部分依据，不等于个人导致输赢。</dd>
      <dt>友伤约束 · ${weight('discipline')}%</dt><dd>友伤 / (伤害 + 友伤 + 50)，达到 5% 时本项记满，上限 100；零友伤不记罚分。</dd>
      <dt>低产出补给依赖 · ${weight('dependency')}%</dt><dd>净消耗队友补给 / max(自身消耗补给, 从队友补给, 1000)，再乘以 1 − max(产出百分位, 贡献百分位)。净消耗为 max(从队友补给 − 补给队友, 0)。高产出、高占点或高支援可抵消该项，不把正常使用队友补给视为过错。</dd></dl>
      <p>前三项罚分为 100 − 百分位。各局等权平均，以 n / (n + ${model.prior_games}) 向参考基线收缩：前三项与胜负基线 50，友伤与依赖为 0。原始综合基线 ${model.raw_baseline} 分，对应展示指数 ${model.baseline} 分。胜负项只按明确胜负的局数收缩。缺失详情、无同队真人可比、队伍归属不明确或非法字段不评分；完整 protobuf 省略的零值按零处理。</p>
      <p>为展开长期平均分，原始罚分通过固定刻度换算为指数：${model.calibration.map(a=>`${a.raw} → ${a.score}`).join('；')}，相邻刻度间线性插值。该刻度不是实时名次或朋友内部百分位；增加朋友不会仅因名单变化重排刻度。展开刻度不代表增加了证据精度。</p>
      <p>指数不超过 ${rule.acquittal_score} 分时当庭释放。超线后，刑期月数 = max(1, 四舍五入(240 × ((指数 − ${rule.acquittal_score}) / ${rule.life_score-rule.acquittal_score})<sup>${rule.exponent}</sup>))，封顶 ${model.max_months} 月。35 分为 1 年 8 个月，50 分为 5 年 10 个月，70 分为 13 年 4 个月；${rule.life_score} 分对应 20 年，20 年及以上显示无期徒刑，同为无期仍按指数排序。</p>
      <div class="court-sentence-bands"><h3>本庭量刑小字</h3>${model.sentence_bands.map(b=>`<p><b>${esc(b.name)}</b> · ${esc(b.flavor)}</p>`).join('')}</div>
      <p>“权重扰动范围”将每一项权重分别上下调整 20% 并重新归一化，再经过同一刻度和量刑函数，只反映模型选择的敏感性，不是置信区间。视野、守点、防空威慑、断补给和战术牺牲未被完整记录，榜单不能判定谁导致输赢。队友补给还包含未登记玩家；后勤数据无法衡量每次补给的战术价值。</p>
      <p>方法参考 ${model.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>`).join(' · ')}。参考的是多维指标、公开权重和小样本处理原则；本项目未实现 TrueSkill。</p></div></details>`;
  }
  function reasons(r) {
    if(r.context){
      const high=primaryPenalty(r);
      const victory=r.components.find(c=>c.key==='victory');
      return `<div class="court-reasons"><span>主要加刑（相对基线）：<b>${high?esc(high.name)+' +'+fmt(high.change,2)+'分':'无明显加刑项'}</b></span><span>贡献缓解：占点 ${r.context.objective_relief_matches} 局 · 重防 / 空优 ${r.context.specialist_relief_matches} 局</span><span>胜负相对 50% 基线：${victory.change===null?'待取证':victory.change<0?'减':victory.change>0?'加':'不变'} ${fmt(Math.abs(victory.change??0),2)} 点原始罚分</span></div>`;
    }
    const ordered=[...r.components].filter(c=>c.change!==null).sort((a,b)=>b.change-a.change);
    const high=ordered.find(c=>c.change>0.05),low=[...ordered].reverse().find(c=>c.change< -0.05);
    return `<div class="court-reasons"><span>相对基线加刑：<b>${high?esc(high.name):'未见明显高于基线的维度'}</b></span><span>相对基线减刑：<b>${low?esc(low.name):'未见明显低于基线的维度'}</b></span></div>`;
  }
  function courtPanel(data) {
    if(!data?.report)return '';
    if(data.model.context)return contextPanel(data);
    const r=data.report;
    return courtHtml`<section class="court-panel" aria-label="个人蘸饭指数"><div class="section-heading"><h2>${icon('scale')}蘸饭指数</h2><span class="badge ${r.eligible?'yellow':'muted'}">${esc(r.status)}</span></div><div class="court-verdict-grid"><div><div class="court-sentence ${tone(r)}">${!r.scored_matches?'待取证':!r.eligible?'暂缓宣判':esc(r.sentence)}</div><p class="court-flavor">${esc(flavor(r))}</p>${r.scored_matches?`<p class="court-score">${!r.eligible?`暂估 ${esc(r.sentence)} · `:''}蘸饭指数 <b class="mono">${fmt(r.score,1)}</b> / 100 · 越高刑期越长</p><p class="hint">原始综合罚分 ${fmt(r.raw_score,2)} / 100 · 固定刻度换算</p>`:'<p class="hint">当前筛选下没有足够的完整可比记录，不将未知表现判为零分。</p>'}<div class="court-samples"><span>可评估 <b>${r.scored_matches}</b> / ${r.matches} 局</span><span>完整详情 ${r.complete_matches} 局</span><span>上榜门槛 ${data.min_games} 局</span><span>免刑线 ${data.model.sentencing.acquittal_score} 分</span></div>${r.scored_matches?`<p class="hint">评分局胜率 ${r.win_rate===null?'—':fmt(r.win_rate,1)+'%'} · ${r.wins} 胜 ${r.losses} 负 · 胜负未知 ${r.scored_matches-r.outcome_matches} 局</p><p class="hint">个人表现收缩权重 ${fmt(100*r.reliability,1)}% · ${r.scored_matches<20?'样本仍少，暂定结果':'按当前筛选的归档记录计算'}</p><p class="hint">权重扰动范围：${months(r.sensitivity.low_months)}至 ${months(r.sensitivity.high_months)}，非置信区间</p>`:''}</div><div class="court-dimensions">${r.components.map(c=>`<div class="court-dimension"><span>${esc(c.name)}<small>${c.weight}%</small></span><div class="track"><span style="width:${c.penalty??0}%"></span></div><b class="mono">${fmt(c.points,1)}<small> / ${c.weight}</small></b></div>`).join('')}<p class="hint">分项合计为原始罚分，非展示指数；胜负未知时该项保留中性先验。</p></div></div>${r.scored_matches?reasons(r):''}${Object.values(r.skipped).some(Boolean)?`<p class="hint court-excluded">未评分：缺详情 ${r.skipped.missing_detail} · 队伍不明 / 分处两队 ${r.skipped.ambiguous_team} · 无有效同队样本 ${r.skipped.no_peers} · 数据异常 ${r.skipped.invalid_data}</p>`:''}${rules(data.model)}</section>`;
  }
  function courtView(data) {
    if(data.kind==='court-evidence-review')return readOnly?'':reviewView(data);
    if(data.kind==='court-model-comparison')return readOnly?courtView(data.current):contextComparison(data);
    if(data.trial)return readOnly?courtView(data.current):comparisonView(data);
    const table=data.members.length?sortableTable('zhanfan-ranking',courtHtml`<div class="table-wrap"><table class="court-ranking"><thead><tr><th class="numeric">名次</th><th>朋友</th><th>娱乐刑期</th><th class="numeric">蘸饭指数</th><th class="numeric">评分局胜率</th><th class="numeric">可评估 / 开黑局数</th><th title="按裁剪前相对基线的额外加刑量选取，至少1分">主要加刑项</th><th>判决状态</th></tr></thead><tbody>${data.members.map(r=>{const high=primaryPenalty(r);return `<tr><td class="numeric mono">${r.rank??'—'}</td><td class="table-title"><a href="#friend/${r.member_id}">${esc(r.name)}</a></td><td class="court-term ${tone(r)}">${r.eligible?esc(r.sentence):esc(r.status)}${r.scored_matches&&!r.eligible?`<div class="table-sub">暂估 ${esc(r.sentence)}</div>`:''}<div class="court-flavor">${esc(flavor(r))}</div></td><td class="numeric mono">${fmt(r.score,1)}<div class="table-sub">原始 ${fmt(r.raw_score,2)}</div></td><td class="numeric mono">${r.win_rate===null?'—':fmt(r.win_rate,1)+'%'}<div class="table-sub">${r.wins} 胜 ${r.losses} 负</div></td><td class="numeric mono">${r.scored_matches} / ${r.matches}</td><td>${!r.scored_matches?'待取证':high?esc(high.name)+`<div class="table-sub">较基线 +${fmt(high.change,2)} 分</div>`:'无明显加刑项'}</td><td><span class="badge ${r.eligible?'yellow':'muted'}">${esc(r.status)}</span></td></tr>`;}).join('')}</tbody></table></div>`,data.members,[
      {index:0,key:'rank',label:'名次',value:r=>r.rank,first:'asc'},
      {index:1,key:'name',label:courtText('朋友'),type:'text',value:r=>r.name},
      {index:2,key:'sentence',label:'娱乐刑期',value:r=>r.sentence_months},
      {index:3,key:'score',label:'蘸饭指数',value:r=>r.score},
      {index:4,key:'win_rate',label:'评分局胜率',value:r=>r.win_rate},
      {index:5,key:'samples',label:'可评估局数',value:r=>r.scored_matches},
    ]):empty(courtText('暂无登记朋友'),'','','scale',true);
    return courtHtml`${viewModes(false)}<div class="section-heading"><h2>蘸饭刑期榜</h2><small>${data.model.sentencing.acquittal_score} 分及以下当庭释放 · ${data.model.sentencing.life_score}分起无期 · 娱乐判决</small></div><div class="analysis-controls"><label>蘸饭榜最低可评估局数<input id="court-min" type="number" min="1" max="10000" step="1" value="${data.min_games}"></label><span class="hint">${data.ranked} / ${data.members.length} 位朋友达到门槛 · ${esc(data.model.version)}</span></div>${table}<div class="notice section-space">${icon('info')}${rankingNotice(data.model)}主要加刑项只比较裁剪前相对各项先验基线的正向增量，至少1分；没有达到门槛则不强行归因。胜率只统计可评分且胜负明确的对局，不同于全部参战胜率。低于门槛不排名，个人页面可查看分项依据。</div>${rules(data.model)}`;
  }
  function contextPanel(data) {
    if(data.model.aggregation)return corePanel(data);
    const r=data.report;
    return courtHtml`<section class="court-panel" aria-label="个人蘸饭指数"><div class="section-heading"><h2>${icon('scale')}蘸饭指数</h2><span class="badge ${r.eligible?'yellow':'muted'}">${esc(r.status)}</span></div><div class="court-verdict-grid"><div><div class="court-sentence ${tone(r)}">${!r.scored_matches?'待取证':!r.eligible?'暂缓宣判':esc(r.sentence)}</div><p class="court-flavor">${esc(flavor(r))}</p>${r.scored_matches?`<p class="court-score">${!r.eligible?`暂估 ${esc(r.sentence)} · `:''}蘸饭指数 <b class="mono">${fmt(r.score,1)}</b> / 100 · 越高刑期越长</p><p class="hint">原始失衡罚分 ${fmt(r.raw_score,2)} / 100 · 直接作为指数，不拉伸分布</p>`:'<p class="hint">当前筛选没有可评估证据，不把未知表现判为零贡献。</p>'}<div class="court-samples"><span>可评估 <b>${r.scored_matches}</b> / ${r.matches} 局</span><span>完整详情 ${r.complete_matches} 局</span><span>上榜门槛 ${data.min_games} 局</span><span>免刑线 ${data.model.sentencing.acquittal_score} 分</span></div>${r.scored_matches?`<p class="hint">评分局胜率 ${r.win_rate===null?'—':fmt(r.win_rate,1)+'%'} · ${r.wins} 胜 ${r.losses} 负 · 胜负未知 ${r.scored_matches-r.outcome_matches} 局</p><p class="hint">个人行为证据权重 ${fmt(100*r.reliability,1)}% · 数据覆盖不是判决准确率</p><p class="hint">权重扰动范围：${months(r.sensitivity.low_months)}至 ${months(r.sensitivity.high_months)}，非置信区间</p>`:''}</div><div class="court-dimensions">${r.components.map(c=>`<div class="court-dimension"><span>${esc(c.name)}<small>${c.weight}%</small></span><div class="track"><span style="width:${c.penalty??0}%"></span></div><b class="mono">${fmt(c.points,1)}<small> / ${c.weight}</small></b></div>`).join('')}<p class="hint">分项合计为原始指数。胜负未知保留中性先验，个人行为缺少样本时保守收缩。</p></div></div>${r.scored_matches?reasons(r)+contextEvidence(r):''}${Object.values(r.skipped).some(Boolean)?`<p class="hint">未评分：缺详情 ${r.skipped.missing_detail} · 队伍不明 ${r.skipped.ambiguous_team} · 无同队参考 ${r.skipped.no_peers} · 数据异常 ${r.skipped.invalid_data} · 全队缺可见活动 ${r.skipped.no_activity}</p>`:''}<p class="hint">未记录视野、守点与战术牺牲，结果仅为基于可见数据的娱乐判决，不是已验证的真实贡献评级。</p>${rules(data.model)}</section>`;
  }
  function rankingNotice(model) {
    if(model.stacked)return '战斗60%与交换40%组成−100～200核心；占点、重防、纯空优、净供给分别减0～20分，补给依赖、友伤、单位损耗分别加0～20分，胜负修正±20分。各项独立叠加，补给保留35%互助额度，不再乘战斗不足系数；先按有效样本收缩，最后合计截断0～100。';
    if(model.context?.score_floor<0){
      const r=model.context,anchors=[0,25,50,75,100].map(n=>50+(n-50)*r.slope/25).join('/');
      return `战斗、交换单项由旧0～100线性映射到${r.score_floor}～${r.score_cap}：旧0/25/50/75/100对应${anchors}。负分可抵扣其他项，核心按60%/40%合成，保留负分及超额到最后，合计后才截断到0～100。胜负±10、补给最多+8、友伤最多+4，样本收缩保留；不按名单拉伸。`;
    }
    if(model.context?.score_cap)return `战斗、交换单项各0～${model.context.score_cap}，按60%/40%组成核心；最终指数仍封顶100。超额直接进入单项，不另收“超过50”的附加罚分。胜负±10、补给最多+8、友伤最多+4，样本收缩保留；不按名单或排名拉伸。`;
    if(model.aggregation)return '战斗60%与交换40%组成0～100核心，胜负修正±10分，补给最多+8、友伤最多+4。中性参照50，25分及以下免刑；高分不再要求额外负面行为凑齐。不按名单或排名拉伸。';
    const policy=model.context?.scale==='independent'?'战斗与交换独立计分；占点、专职战果有限减刑，蹭补给条件加刑。42.5分为中性参照，不自动免刑；25分及以下免刑，不按名单拉伸。':model.context?'五维失衡评分，原始罚分直接作为指数，占点或专职战果有限缓解，蹭补给条件加刑。':'六维评分，固定刻度展开长期均分，不按朋友内部名次强制分配刑期。';
    return policy+`含胜负表现 ${model.dimensions.find(d=>d.key==='victory').weight}%；`;
  }
  function coreEvidenceView(r) {
    if(r.context.risk_examples.some(e=>e.corrections)||r.components.some(c=>c.key==='transport'))return stackedEvidenceView(r);
    const c=r.context,cap=r.score_breakdown.item_cap??100,floor=r.score_breakdown.item_floor??0,examples=[...new Map([...c.risk_examples,...c.relief_examples].map(e=>[e.match_id,e])).values()];
    return `<details class="court-trial-evidence"><summary>逐局依据与减刑记录</summary><p>战斗罚分高于中性 ${c.imbalanced_matches} / ${r.scored_matches} 局；交换罚分高于中性 ${c.exchange_matches} 局；补给加刑触发 ${r.freeloading.penalized_matches} 局。占点减刑 ${c.objective_relief_matches} 局，重防 / 空优战果减刑 ${c.specialist_relief_matches} 局。</p><p>场均净消耗队友补给 ${fmt(r.freeloading.net_received/r.scored_matches,1)}；最终补给修正 ${sign(r.components.find(c=>c.key==='dependency').points)} / +8 分。以下自动选取个人行为罚分较高的最多三局、贡献减免最多两局，不是人工标签。</p>${examples.map(e=>`<div class="court-context-example"><a href="#match/${esc(e.match_id)}">#${esc(e.match_id)}</a><span>战斗罚分 ${fmt(e.combat_base,1)} → ${fmt(e.combat_penalty,1)} · 交换罚分 ${fmt(e.exchange_base,1)} → ${fmt(e.exchange_penalty,1)}（各 ${floor}～${cap}）</span><span>核心单局 ${fmt(e.core_points,2)} / ${cap} · 补给 +${fmt(e.penalties.dependency*.08,2)} · 友伤 +${fmt(e.penalties.discipline*.04,2)}（胜负另计，汇总后收缩）</span><span>占点 / 专职信用 ${fmt(e.support_credit,1)} 点分项罚分，不叠加；核心共减 ${fmt(e.relief_points,2)} 分</span><span>摧毁 / 损失 ${fmt(e.values.destruction)} / ${fmt(e.values.losses)} · 伤害 ${fmt(e.values.damage)} · 占点 ${fmt(e.values.objectives)}</span><span>其他同队人均：摧毁 ${fmt(e.references.destruction,1)} · 伤害 ${fmt(e.references.damage,1)} · 占点 ${fmt(e.references.objectives,2)}</span><span>净吃补给 ${fmt(e.net_received)}（${fmt(e.supply_share*100,1)}%）${e.unavailable_specialists?' · 部分专职证据未知':''}</span></div>`).join('')}<p>视野、守点、威慑与牺牲未完整记录；高分只是可见证据下的娱乐严重程度，不是个人导致输赢的定论。</p></details>`;
  }
  function stackedEvidenceView(r) {
    const c=r.context,examples=[...new Map([...c.risk_examples,...c.relief_examples].map(e=>[e.match_id,e])).values()];
    return `<details class="court-trial-evidence"><summary>逐局依据与减刑记录</summary><p>补给净依赖超过35%：${r.freeloading.dependent_matches} / ${r.scored_matches}局；实际触发 ${r.freeloading.penalized_matches}局。场均净消耗队友补给 ${fmt(r.freeloading.net_received/r.scored_matches,1)}；收缩后补给修正 ${sign(r.components.find(c=>c.key==='dependency').points)} / +20分。所有有效局（包括0分局）等权平均，补给不再受战斗或其他减免门槛影响。</p>${examples.map(e=>`<div class="court-context-example"><a href="#match/${esc(e.match_id)}">#${esc(e.match_id)}</a><span>战斗 ${fmt(e.combat,1)} · 交换 ${fmt(e.exchange,1)} · 核心 ${fmt(e.core,2)}</span><span>${r.components.filter(c=>c.kind==='adjustment'&&c.key!=='victory').map(c=>`${esc(c.name)} ${sign(e.corrections[c.key])}`).join(' · ')}</span><span>摧毁 / 损失 ${fmt(e.values.destruction)} / ${fmt(e.values.losses)} · 单位击杀 / 损失 ${fmt(e.values.kills)} / ${fmt(e.values.units_lost)} · 净吃补给 ${fmt(e.net_received)}（${fmt(e.supply_share*100,1)}%）</span></div>`).join('')}<p>以上为自动选取的高罚分与高减免对局，不是人工认定。净补给可能来自约定的集中保障；单位损耗与价值交换仍相关，未记录的视野、守点和牺牲也可能导致误判。</p></details>`;
  }
  function stackedRules(model) {
    const r=model.context;
    return courtHtml`<details class="court-rules"><summary>判决规则与资料 · ${esc(model.version)}</summary><div class="court-rules-body">
      <p>朋友间自定义娱乐规则，采用已确认的叠加20分试算v2，不是官方实力评级，未经人工回放标签验证，不按当前名单或名次拉伸。</p>
      <p>战斗、交换沿用量尺P=clamp(50−75×log₂((本人值+b)/(参考值+b)),−100,200)。战斗=摧毁罚分×60%+伤害罚分×40%，参考其他同队真人人均，缓冲b分别为500、50；交换比较本人摧毁与本人损失，b=500。基础核心=战斗×60%+交换×40%。账号按人局合并，参考排除本人、敌方、AI和观战者。</p>
      <p>不再从战斗或交换中预扣“三项取最大值”的信用。下列修正按实际程度分别计算，独立叠加，正负只在最终合计相抵；clip限制0～1，不按榜单名次固定奖惩。</p>
      <dl>${model.dimensions.filter(d=>d.kind==='adjustment').map(d=>`<dt>${esc(d.name)} · ${d.direction==='signed'?'−20～+20':d.direction==='relief'?'−20～0':'0～+20'}分</dt><dd>${esc(d.rule)}</dd>`).join('')}</dl>
      <p>各局等权平均，不累计服刑。核心以n/(n+${model.prior_games})向50收缩；每项修正使用该项有效局数k，向0作k/(k+${model.prior_games})收缩。共同胜负使用明确结果，失败率=(败局+5)/(明确结果局数+10)，未知不记输。分类或单位数量未知时不补零，不丢弃其他有效证据，页面显示各项有效/缺失局数。</p>
      <p>净蹭补给的35%额度保留，但不再乘战斗不足程度，也不提前被占点、重防、空优等贡献抵消。所有有效局（含未超线的0分局）参与均值。只抵同局净补给，不跨局抵账；高依赖也可能是队伍约定的集中保障。</p>
      <p>裁剪前合计=核心+全部修正，保留负分和超100部分，最后截断到0～100。指数≤${model.sentencing.acquittal_score}当庭释放；月数=max(1,round(240×((指数−25)/50)<sup>1.4</sup>))，封顶360月。${model.sentencing.life_score}分起无期，低于75最多239月。无样本待取证，默认至少5局才排名；少于20局为初步判决。</p>
      <p>单位损耗附加与价值交换仍相关，贡献叠加也可能重复奖励；专职总击杀不是敌机击落数。缺详情、无效时长、非法必要字段、队伍不明、无同队参考和全队无可见活动不评分。视野、控制时长、补给用途和战术牺牲未完整记录，结果不是个人导致输赢的定论。权重扰动仅逐项上下调整20%，核心重新归一化，修正单独调幅，不是置信区间。</p>
      <div class="court-sentence-bands"><h3>本庭量刑小字</h3>${model.sentence_bands.map(b=>`<p><b>${esc(b.name)}</b> · ${esc(b.flavor)}</p>`).join('')}</div>
      <p>方法参考 ${model.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>`).join(' · ')}；不为本项目具体权重或刑期背书。</p>
    </div></details>`;
  }
  function coreRules(model) {
    if(model.stacked)return stackedRules(model);
    const r=model.context,cap=r.score_cap??100,floor=r.score_floor??0,overcap=cap>100,signed=floor<0;
    const anchors=[4,2,1,.5,.25].map(ratio=>Math.max(floor,Math.min(cap,50-r.slope*Math.log2(ratio)))).join('、');
    const exampleCore=(20*cap+10*50)/30;
    const signedExample=`20场、80%胜率，若每场减免后两项均为${cap}，无补给或友伤，核心收缩为${fmt(exampleCore,2)}，胜负修正−4，合计${fmt(exampleCore-4,2)}，最终截为100。抵扣示例：单场战斗${floor}、交换${cap}，60%/40%加权为${fmt(floor*.6+cap*.4,1)}，而非先把负分归零所得的${fmt(cap*.4,1)}。`;
    return courtHtml`<details class="court-rules"><summary>判决规则与资料 · ${esc(model.version)}</summary><div class="court-rules-body">
      <p>自定义娱乐判决，未经人工标签或预测验证。战斗、交换单项和原始核心范围为${floor}～${cap}，最终指数仍为0～100；不按当前名单或最差名次拉伸。${overcap?'允许单项超额，不另加“超过50”的附加处罚，避免重复计罚。':''}高分更可达，不代表当前必须有人达到90。</p>
      <p>单局量尺：P=clamp(50−${r.slope}×log₂((本人值+b)/(参考值+b)),${floor},${cap})。缓冲后的比例4倍、2倍、相等、1/2、1/4分别对应罚分${anchors}${overcap&&!signed?`；1/8对应${Math.min(cap,125)}，1/16对应${Math.min(cap,150)}`:''}；双零为中性50。战斗罚分=摧毁罚分×60%+伤害罚分×40%，参考其他同队真人人均值，b=${r.destruction_buffer}、${r.damage_buffer}。交换罚分比较本人摧毁与损失，b=${r.destruction_buffer}；账号先按人局合并，参考不含本人、敌方、AI和观战者。</p>
      <p>占点、重防及实际纯空优挂载沿用有限信用：20×clamp((本人该项−其他队友人均)/(其他队友人均+2),0,1)。三者只取最有利的一条，不叠加，分别从战斗与交换罚分扣最多20点，最低${floor}。核心最多因此减20分。出场不是职责证明、总击杀不是敌机击落；同队分类不明时不使用该类比较。</p>
      <dl><dt>核心表现 · ${floor}～${cap}分</dt><dd>核心=减免后战斗罚分×60%+减免后交换罚分×40%。各局等权平均，再以 n/(n+${model.prior_games}) 向50收缩；不累计服刑，也不因赢局清空个人行为。${signed?'负分和超过100的部分均保留到最终合计；不先将每项截到0～100。':overcap?'超过100的部分保留到最终合计，不能先将每项截回100。':''}</dd>
      <dt>胜负修正 · −10～+10分</dt><dd>20×(收缩后失败率−50%)。失败率=(败局数+5)/(明确结果局数+10)，未知胜负不计输；无明确结果修正0。它仍能带来20分差距，但不再占用核心满分的25%。</dd>
      <dt>蹭队友补给 · 0～+8分</dt><dd>净消耗N=max(从队友补给−补给队友,0)，比例S=N/max(自身消耗补给,从队友补给,1000)。单局严重度F=clip((S−0.35)/0.65)×clip((减免后战斗罚分−50)/50)，clip限制0～1。修正=8×各局F均值×n/(n+10)。不送不罚，同局供给只抵扣净吃补给，不跨局抵账，不混加不同资源单位。</dd>
      <dt>友伤修正 · 0～+4分</dt><dd>单局严重度=clip(友伤/(伤害+友伤+50)/${r.friendly_fire_limit})；均值向0收缩后乘4，不推断故意。没有友伤、没有蹭补给也能达到90。</dd></dl>
      <p>裁剪前合计=核心+胜负修正+补给修正+友伤修正，最后限制在0～100。页面分别展示核心、带正负号的修正、裁剪前合计和最终指数，修正不是百分比权重，不重新归一化。先验综合50，但无记录仍待取证；默认5局才能排名，少于20局为初步结果。</p>
      <h3>截断与高分可达性参照</h3><p>${signed?signedExample:overcap?`有限样本反例测试：20场、80%胜率，若每场减免后的战斗和交换均为${Math.min(cap,125)}，没有补给/友伤罚分，核心收缩后为${fmt((20*Math.min(cap,125)+10*50)/30,2)}，胜负修正−4，最终${fmt(Math.max(0,Math.min(100,(20*Math.min(cap,125)+10*50)/30-4)),1)}分。单项上限100时，同一证据仅得79.3分。`:'有限样本反例测试：40场、50%胜率，若每场减免后的战斗和交换均为100，且没有补给/友伤罚分，最终90分；100场、80%胜率，同样核心表现最终也为90分。'}它们是构造测试，不是任何朋友的真实数据。</p>
      <div class="table-wrap"><table><thead><tr><th>长期参照（缓冲后比例，无信用或额外罚分）</th><th class="numeric">指数</th><th>娱乐刑期</th></tr></thead><tbody>${model.benchmarks.map(b=>`<tr><td>${esc(b.name)}</td><td class="numeric mono">${fmt(b.score,1)}</td><td>${b.sentence_months===0?'当庭释放':months(b.sentence_months)}</td></tr>`).join('')}</tbody></table></div>
      <p>中性参照50不是无罪线。指数≤${model.sentencing.acquittal_score}当庭释放；超线月数=max(1,round(240×((指数−${model.sentencing.acquittal_score})/${model.sentencing.life_score-model.sentencing.acquittal_score})<sup>${model.sentencing.exponent}</sup>))，封顶360月。${model.sentencing.life_score}分达到20年，${model.sentencing.life_score}分及以上为无期，低于此线最多239月，避免四舍五入提前无期；同为无期按指数排序。权重扰动对核心两项重新归一化，对三个修正单独调整幅度，并非置信区间。</p>
      <p>缺详情、无效时长、非法必要字段、队伍不明、无同队参考和全队无可见活动不评分。省略的protobuf零与显式未知仍区分；样本收缩不是准确率。侦察、控制时长、激光协同、战术牺牲仍可能造成误判，不能用测试通过替代真实回放验证。</p>
      <div class="court-sentence-bands"><h3>本庭量刑小字</h3>${model.sentence_bands.map(b=>`<p><b>${esc(b.name)}</b> · ${esc(b.flavor)}</p>`).join('')}</div>
    </div></details>`;
  }
  function corePanel(data) {
    const r=data.report,b=r.score_breakdown,cap=data.model.context.score_cap??100,floor=data.model.context.score_floor??0;
    const maxPoints=c=>c.kind==='core'?c.weight*cap/100:c.cap??(c.key==='victory'?10:c.weight);
    const track=c=>{
      if(c.kind==='core'&&floor<0){
        const zero=-floor/(cap-floor)*100,value=(c.penalty??0)/(cap-floor)*100;
        return `<div class="track court-signed-track" style="--court-zero:${zero}%"><span style="left:${zero+Math.min(0,value)}%;width:${Math.abs(value)}%;${value<0?'background:var(--green)':''}"></span></div>`;
      }
      return `<div class="track"><span style="width:${c.points===null?0:Math.min(100,Math.abs(c.points)/maxPoints(c)*100)}%;${c.points<0?'background:var(--green)':''}"></span></div>`;
    };
    const limit=c=>c.kind==='core'?`${c.weight}%核心 · 罚分${fmt(c.penalty,1)}/${cap}`:c.cap?`${c.direction==='signed'?'±':c.direction==='relief'?'−':'+'}${c.cap}分 · ${c.samples}局${c.unavailable?' / 缺'+c.unavailable:''}`:c.key==='victory'?'±10分':`+${c.weight}分`;
    return courtHtml`<section class="court-panel" aria-label="个人蘸饭指数"><div class="section-heading"><h2>${icon('scale')}蘸饭指数</h2><span class="badge ${r.eligible?'yellow':'muted'}">${esc(r.status)}</span></div>
      <div class="court-verdict-grid"><div><div class="court-sentence ${tone(r)}">${!r.scored_matches?'待取证':!r.eligible?'暂缓宣判':esc(r.sentence)}</div><p class="court-flavor">${esc(flavor(r))}</p>
      ${r.scored_matches?`<p class="court-score">${!r.eligible?`暂估 ${esc(r.sentence)} · `:''}蘸饭指数 <b class="mono">${fmt(r.score,1)}</b> / 100 · 越高刑期越长</p><p class="hint">核心 ${fmt(b.core,2)} / ${cap} · ${b.adjustments.map(c=>`${esc(c.name)} ${sign(c.points)}`).join(' · ')} · 裁剪前 ${fmt(b.before_clamp,2)}</p><p class="hint">${floor<0?'负分与超额分均参与合计，最后才截断到0～100。':'最终指数限制在0～100；'}不按朋友名次拉伸。</p>`:'<p class="hint">没有可评估证据，不把未知表现当作零贡献。</p>'}
      <div class="court-samples"><span>可评估 <b>${r.scored_matches}</b> / ${r.matches} 局</span><span>完整详情 ${r.complete_matches} 局</span><span>上榜门槛 ${data.min_games} 局</span><span>免刑线${data.model.sentencing.acquittal_score}分</span><span>无期线${data.model.sentencing.life_score}分</span></div>
      ${r.scored_matches?`<p class="hint">评分局胜率 ${r.win_rate===null?'—':fmt(r.win_rate,1)+'%'} · ${r.wins} 胜 ${r.losses} 负 · 胜负未知 ${r.scored_matches-r.outcome_matches} 局</p><p class="hint">个人证据收缩权重 ${fmt(r.reliability*100,1)}%，非判决准确率</p><p class="hint">权重扰动范围：${months(r.sensitivity.low_months)}至 ${months(r.sensitivity.high_months)}，非置信区间</p>`:''}</div>
      <div class="court-dimensions">${r.components.map(c=>`<div class="court-dimension"><span>${esc(c.name)}<small>${limit(c)}</small></span>${track(c)}<b class="mono">${c.kind==='adjustment'?sign(c.points,data.model.stacked?2:1):fmt(c.points,1)}<small>${c.kind==='core'?' / '+maxPoints(c):'分'}</small></b></div>`).join('')}
      <p class="hint">两项组成${floor}～${cap}核心${floor<0?'，负分可抵扣其他项':''}，${data.model.stacked?'其余八项独立叠加':'后三项直接加减'}；胜负未知修正为0，不当作败局。</p></div></div>
      ${r.scored_matches?reasons(r)+contextEvidence(r):''}${Object.values(r.skipped).some(Boolean)?`<p class="hint">未评分：缺详情 ${r.skipped.missing_detail} · 队伍不明 ${r.skipped.ambiguous_team} · 无同队参考 ${r.skipped.no_peers} · 数据异常 ${r.skipped.invalid_data} · 全队缺可见活动 ${r.skipped.no_activity}</p>`:''}<p class="hint">仍是基于可见数据的娱乐规则，未完整记录视野、守点、威慑与牺牲，不是已验证的个人贡献评级。</p>${rules(data.model)}</section>`;
  }
  return {courtPanel,courtView};
}
