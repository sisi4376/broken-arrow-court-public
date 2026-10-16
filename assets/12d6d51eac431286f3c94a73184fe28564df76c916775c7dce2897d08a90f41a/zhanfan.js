import { courtText, courtHtml } from './court-ui.js';
import { sortableTable } from './table-sort.js';

export function createCourt({S,esc,icon,fmt,empty}) {
  const months=n=>n===null||n===undefined?'—':n>=240?'无期徒刑':`${Math.floor(n/12)} 年 ${n%12} 个月`;
  const flavor=r=>r.eligible?r.flavor:r.scored_matches?'战报还没凑齐，先别急着领饭勺。':r.flavor;
  const tone=r=>r.score===null?'muted':r.sentence_months===0?'positive':r.score>=55?'negative':'yellow';
  function rules(model) {
    return courtHtml`<details class="court-rules"><summary>判决规则与资料 · ${esc(model.version)}</summary><div class="court-rules-body"><p>纯属朋友间的游戏娱乐，不是官方实力评级，也不是真实刑罚。权重和阈值为本项目自定义，未经胜负预测校准。</p><p>每局仅与同队真人比较，朋友多账号先合并。采用含并列的百分位：低于自己的个数 + 同值个数的一半，再除以同队人数。不同日期、地图、模式不直接比较原始分数。胜负、评分涨跌不直接定罪；不以多玩累计加刑。</p><dl><dt>战损交换 · 30%</dt><dd>(摧毁分 − 损失分) / (摧毁分 + 损失分 + 500)，再取同队百分位。</dd><dt>战斗 / 后勤产出 · 25%</dt><dd>每分钟伤害与每分钟补给队友，取较高百分位；没有补给时，后勤百分位为 0。</dd><dt>占点 / 支援贡献 · 25%</dt><dd>每分钟占点与每分钟补给队友，取较高百分位。占点仅有次数，没有守点时长；后勤在两项中提供补偿，但不能免除交换、友伤等项。</dd><dt>友伤约束 · 10%</dt><dd>友伤 / (伤害 + 友伤 + 50)，达到 5% 时本项记满，上限 100；零友伤不记罚分。</dd><dt>低产出补给依赖 · 10%</dt><dd>净消耗队友补给 / max(自身消耗补给, 从队友补给, 1000)，再乘以 1 − max(产出百分位, 贡献百分位)。净消耗为 max(从队友补给 − 补给队友, 0)。高产出、高占点或高支援可抵消该项，不把使用队友补给本身视为过错。</dd></dl><p>前三项罚分为 100 − 百分位。各局等权平均后，以 n / (n + 10) 向参考基线收缩：前三项基线 50，后两项为 0，综合基线为 40。缺失详情、无同队真人可比、队伍归属不明确或非法字段的对局不参与评分；完整 protobuf 省略的零值按零处理。指数不超过 ${model.sentencing.acquittal_score} 分时，当庭释放，不以正常波动定罪。超过免刑线后，刑期月数 = max(1, 四舍五入(240 × ((指数 − 40) / 50)²))，折算封顶 360 月；50 分约 10 个月，60 分约 3 年 2 个月，70 分约 7 年 2 个月。90 分对应 20 年，20 年（240 个月）及以上统一显示无期徒刑，同为无期仍按指数排序。</p><div class="court-sentence-bands"><h3>本庭量刑小字</h3>${model.sentence_bands.map(b=>`<p><b>${esc(b.name)}</b> · ${esc(b.flavor)}</p>`).join('')}</div><p>“权重扰动范围”将每一项权重分别上下调整 20% 并重新归一化，只反映模型选择的敏感性，不是置信区间。视野、守点、防空威慑、断补给和战术牺牲未被完整记录，榜单不能判定谁导致输赢。队友补给还包含未登记玩家；后勤数据无法衡量每次补给的战术价值。</p><p>方法参考 ${model.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>`).join(' · ')}。参考的是多维指标、公开权重和小样本处理原则；本项目未实现 TrueSkill。</p></div></details>`;
  }
  function reasons(r) {
    const ordered=[...r.components].filter(c=>c.change!==null).sort((a,b)=>b.change-a.change);
    const high=ordered.find(c=>c.change>0.05),low=[...ordered].reverse().find(c=>c.change< -0.05);
    return `<div class="court-reasons"><span>相对基线加刑：<b>${high?esc(high.name):'未见明显高于基线的维度'}</b></span><span>相对基线减刑：<b>${low?esc(low.name):'未见明显低于基线的维度'}</b></span></div>`;
  }
  function courtPanel(data) {
    if(!data?.report)return '';
    const r=data.report;
    return courtHtml`<section class="court-panel" aria-label="个人蘸饭指数"><div class="section-heading"><h2>${icon('scale')}蘸饭指数</h2><span class="badge ${r.eligible?'yellow':'muted'}">${esc(r.status)}</span></div><div class="court-verdict-grid"><div><div class="court-sentence ${tone(r)}">${!r.scored_matches?'待取证':!r.eligible?'暂缓宣判':esc(r.sentence)}</div><p class="court-flavor">${esc(flavor(r))}</p>${r.scored_matches?`<p class="court-score">${!r.eligible?`暂估 ${esc(r.sentence)} · `:''}综合分 <b class="mono">${fmt(r.score,1)}</b> / 100 · 越高刑期越长</p>`:'<p class="hint">当前筛选下没有足够的完整可比记录，不将未知表现判为零分。</p>'}<div class="court-samples"><span>可评估 <b>${r.scored_matches}</b> / ${r.matches} 局</span><span>完整详情 ${r.complete_matches} 局</span><span>上榜门槛 ${data.min_games} 局</span><span>免刑线 ${data.model.sentencing.acquittal_score} 分</span></div>${r.scored_matches?`<p class="hint">样本收缩权重 ${fmt(100*r.reliability,1)}% · ${r.scored_matches<20?'样本仍少，暂定结果':'按当前筛选的归档记录计算'}</p><p class="hint">权重扰动范围：${months(r.sensitivity.low_months)}至 ${months(r.sensitivity.high_months)}，非置信区间</p>`:''}</div><div class="court-dimensions">${r.components.map(c=>`<div class="court-dimension"><span>${esc(c.name)}<small>${c.weight}%</small></span><div class="track"><span style="width:${c.penalty??0}%"></span></div><b class="mono">${fmt(c.points,1)}<small> / ${c.weight}</small></b></div>`).join('')}<p class="hint">分项显示加权罚分；四舍五入后可能与总分略有差异。</p></div></div>${r.scored_matches?reasons(r):''}${Object.values(r.skipped).some(Boolean)?`<p class="hint court-excluded">未评分：缺详情 ${r.skipped.missing_detail} · 队伍不明 / 分处两队 ${r.skipped.ambiguous_team} · 无有效同队样本 ${r.skipped.no_peers} · 数据异常 ${r.skipped.invalid_data}</p>`:''}${rules(data.model)}</section>`;
  }
  function courtView(data) {
    const table=data.members.length?sortableTable('zhanfan-ranking',courtHtml`<div class="table-wrap"><table class="court-ranking"><thead><tr><th class="numeric">名次</th><th>朋友</th><th>娱乐刑期</th><th class="numeric">蘸饭指数</th><th class="numeric">可评估 / 开黑局数</th><th>主要罚分项</th><th>判决状态</th></tr></thead><tbody>${data.members.map(r=>{const high=[...r.components].filter(c=>c.points>0).sort((a,b)=>b.points-a.points)[0];return `<tr><td class="numeric mono">${r.rank??'—'}</td><td class="table-title"><a href="#friend/${r.member_id}">${esc(r.name)}</a></td><td class="court-term ${tone(r)}">${r.eligible?esc(r.sentence):esc(r.status)}${r.scored_matches&&!r.eligible?`<div class="table-sub">暂估 ${esc(r.sentence)}</div>`:''}<div class="court-flavor">${esc(flavor(r))}</div></td><td class="numeric mono">${fmt(r.score,1)}</td><td class="numeric mono">${r.scored_matches} / ${r.matches}</td><td>${high?esc(high.name):'—'}</td><td><span class="badge ${r.eligible?'yellow':'muted'}">${esc(r.status)}</span></td></tr>`;}).join('')}</tbody></table></div>`,data.members,[
      {index:0,key:'rank',label:'名次',value:r=>r.rank,first:'asc'},
      {index:1,key:'name',label:courtText('朋友'),type:'text',value:r=>r.name},
      {index:2,key:'sentence',label:'娱乐刑期',value:r=>r.sentence_months},
      {index:3,key:'score',label:'蘸饭指数',value:r=>r.score},
      {index:4,key:'samples',label:'可评估局数',value:r=>r.scored_matches},
    ]):empty(courtText('暂无登记朋友'),'','','scale',true);
    return courtHtml`<div class="section-heading"><h2>蘸饭指数榜</h2><small>${data.model.sentencing.acquittal_score} 分及以下当庭释放 · 娱乐判决</small></div><div class="analysis-controls"><label>蘸饭榜最低可评估局数<input id="court-min" type="number" min="1" max="10000" step="1" value="${data.min_games}"></label><span class="hint">${data.ranked} / ${data.members.length} 位朋友达到门槛 · ${esc(data.model.version)}</span></div>${table}<div class="notice section-space">${icon('info')}这是自定义娱乐评分，不是官方水平认定。免刑线内当庭释放，超线后才按二次曲线量刑；指数与排名算法不变。只评估完整、可比较的合格开黑局；不按参战总量累加刑期，不把团队输赢直接归罪个人。低于门槛不排名，个人页面可查看分项依据。</div>${rules(data.model)}`;
  }
  return {courtPanel,courtView};
}
