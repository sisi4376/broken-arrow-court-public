const unit = n => Math.max(0, Math.min(1, n));

export const STACKED_CORRECTIONS = [
  {key:'victory',name:'共同胜负',direction:'signed',rule:'明确胜负独立收缩；修正=40×(收缩后失败率−0.5)，范围−20～+20。不推断个人造成输赢。'},
  {key:'dependency',name:'净蹭队友补给',direction:'penalty',rule:'净吃比例=max(从队友补给−补给队友,0)/max(自身消耗,从队友补给,1000)；35%以内不罚，超出后20×clip((比例−35%)/65%)，独立于战斗和其他贡献，最多20。'},
  {key:'discipline',name:'友伤约束',direction:'penalty',rule:'友伤/(伤害+友伤+50)/5%，限制0～1后乘20；不判断是否故意。'},
  {key:'unit_kd',name:'单位损耗附加',direction:'penalty',rule:'单位K/D（击杀+1）/(损失+1)低于其他同队人均参考，且价值交换罚分高于50时才加刑；两种缺口相乘，最多20。缺少有效单位数量则不计。'},
  {key:'objectives',name:'占点贡献',direction:'relief',rule:'20×clip((本人占点−其他队友人均)/(其他队友人均+2))；零占点不单独罚。'},
  {key:'heavy',name:'重防战果',direction:'relief',rule:'本人重防单位总击杀相对其他队友同类人均，按占点同一公式、缓冲2计算；分类不明不算零。'},
  {key:'air',name:'纯空优战果',direction:'relief',rule:'本人实际纯空优挂载单位总击杀，单独计算最多20；不是敌机击落数量，混合/轰炸挂载不算。'},
  {key:'transport',name:'净补给队友',direction:'relief',rule:'20×max(补给队友−从队友补给,0)/max(自身消耗,补给队友,1000)。只抵同局，不奖励循环互送的毛额。'},
];

export function stackedEvidence(g,team,model) {
  const original=independentEvidence(g,team,model);
  if(!original)return null;
  const e=original.evidence,v=g.values,others=team.filter(t=>t.key!==g.key);
  const objectives=20*unit((v.objectives-e.references.objectives)/(e.references.objectives+2));
  const specialist=key=>e.specialist_values.find(s=>s.kind===key)?.credit??null;
  const heavy=specialist('heavy'),air=specialist('air');
  const netSupplied=Math.max(0,v.supplied-v.received);
  const transport=20*unit(netSupplied/Math.max(v.consumed,v.supplied,1000));
  const relief=objectives+(heavy??0)+(air??0)+transport;
  let unitKd=null,kdReference=null,kdOwn=null;
  if(team.every(t=>['kills','units_lost'].every(k=>Number.isSafeInteger(t.values[k])&&t.values[k]>=0))){
    const mean=key=>others.reduce((n,p)=>n+p.values[key]/others.length,0);
    kdOwn=(v.kills+1)/(v.units_lost+1);
    kdReference=(mean('kills')+1)/(mean('units_lost')+1);
    unitKd=20*unit(1-kdOwn/kdReference)*unit((e.exchange_base-50)/150);
  }
  const corrections={dependency:20*unit((e.supply_share-.35)/.65),discipline:original.penalties.discipline*.2,
    unit_kd:unitKd,objectives:-objectives,heavy:heavy===null?null:-heavy,air:air===null?null:-air,transport:-transport};
  const core=e.combat_base*.6+e.exchange_base*.4;
  return {core,combat:e.combat_base,exchange:e.exchange_base,corrections,
    before_outcome:core+Object.values(corrections).reduce((n,v)=>n+(v??0),0),relief,
    values:{...v},references:e.references,kd_own:kdOwn,kd_reference:kdReference,
    specialist_values:e.specialist_values,net_supplied:netSupplied,net_received:e.net_received,supply_share:e.supply_share};
}

// Fixed policy choices, not fitted to the current friends or score distribution.
export const CONTEXT_RULES = {
  adequate: 0.8, destruction_buffer: 500, damage_buffer: 50,
  objectives_buffer: 2, specialist_buffer: 2, specialist_cap: 0.8, relief_limit: 0.5,
  free_supply_share: 0.35, supply_buffer: 1000, friendly_fire_limit: 0.05,
};

export function contextualEvidence(g, team, model) {
  const rule = model.context, v = g.values, others = team.filter(t => t.key !== g.key);
  if (!others.length) return null;
  const mean = key => others.reduce((sum, t) => sum + t.values[key] / others.length, 0);
  const specialistAvailable = ['heavy', 'air'].filter(kind => team.every(t => t.unit_evidence[kind].known));
  const active = team.some(t => t.values.destruction > 0 || t.values.damage > 0 || t.values.objectives > 0 ||
    ['heavy', 'air'].some(kind => t.unit_evidence[kind].known && t.unit_evidence[kind].kills > 0));
  if (!active) return null;
  const references = { destruction: mean('destruction'), damage: mean('damage'), objectives: mean('objectives') };
  const combat = 0.6 * unit((v.destruction + rule.destruction_buffer) / (references.destruction + rule.destruction_buffer)) +
    0.4 * unit((v.damage + rule.damage_buffer) / (references.damage + rule.damage_buffer));
  const objectives = unit(v.objectives / (references.objectives + rule.objectives_buffer));
  const specialistValues = specialistAvailable.map(kind => {
    const reference = others.reduce((sum, t) => sum + t.unit_evidence[kind].kills / others.length, 0);
    return { kind, kills: g.unit_evidence[kind].kills, reference,
      value: rule.specialist_cap * unit(g.unit_evidence[kind].kills / (reference + rule.specialist_buffer)) };
  });
  const specialist = Math.max(0, ...specialistValues.map(s => s.value));
  const shortfall = value => unit((rule.adequate - value) / rule.adequate);
  const rawContribution = Math.max(combat, objectives, specialist), combatDeficit = shortfall(combat);
  // Captures and total specialist kills lack tactical attribution: mitigate, never erase the combat gap alone.
  const relief = Math.min(Math.max(0, combatDeficit - shortfall(rawContribution)), combatDeficit * rule.relief_limit);
  const deficit = Math.max(0, combatDeficit - relief);
  const contribution = combatDeficit > 0 ? rule.adequate * (1 - deficit) : combat;
  const negativeExchange = unit(Math.max(0, v.losses - v.destruction) / (v.losses + rule.destruction_buffer));
  const net_received = Math.max(0, v.received - v.supplied);
  const share = unit(net_received / Math.max(v.consumed, v.received, rule.supply_buffer));
  const excessSupply = unit((share - rule.free_supply_share) / (1 - rule.free_supply_share));
  const penalties = {
    pressure: 100 * deficit,
    exchange: 100 * negativeExchange * deficit,
    dependency: 100 * excessSupply * deficit,
    discipline: 100 * unit(v.friendly_fire / (v.damage + v.friendly_fire + 50) / rule.friendly_fire_limit),
  };
  const credit = 100 * relief;
  return {
    penalties,
    food: { net_received, share, contribution: contribution * 100, penalty: penalties.dependency },
    support: { available: specialistAvailable.length > 0, credit: specialist > Math.max(combat, objectives) ? credit : 0 },
    evidence: {
      values: { ...v }, references, combat, objectives, specialist, contribution, deficit,
      negative_exchange: negativeExchange, supply_share: share, net_received, specialist_values: specialistValues,
      unavailable_specialists: 2 - specialistAvailable.length,
      objective_relief: objectives > combat && objectives >= specialist ? credit : 0,
      specialist_relief: specialist > Math.max(combat, objectives) ? credit : 0,
      penalties,
    },
  };
}

export const INDEPENDENT_RULES = {
  scale: 'independent', slope: 25, destruction_buffer: 500, damage_buffer: 50,
  objectives_buffer: 2, specialist_buffer: 2, relief_cap: 20,
  free_supply_share: 0.35, supply_buffer: 1000, friendly_fire_limit: 0.05,
  food_contribution_limit: 50,
};

export function independentRatioPenalty(value, reference, buffer, cap=100, floor=0, slope=INDEPENDENT_RULES.slope) {
  if ([value, reference, buffer].some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > Number.MAX_SAFE_INTEGER)) return null;
  if (!Number.isInteger(cap) || cap < 100 || cap > 200) return null;
  if (!Number.isInteger(floor) || floor < -100 || floor > 0 || !Number.isFinite(slope) || slope <= 0) return null;
  if (value === reference) return 50;
  if (!value && !buffer) return cap;
  if (!reference && !buffer) return floor;
  return Math.max(floor,Math.min(cap,50-slope*(Math.log2(value+buffer)-Math.log2(reference+buffer))));
}

export function independentEvidence(g, team, model) {
  const rule = model.context, v = g.values, others = team.filter(t => t.key !== g.key);
  if (!others.length) return null;
  const active = team.some(t => t.values.destruction > 0 || t.values.damage > 0 || t.values.objectives > 0 ||
    ['heavy', 'air'].some(kind => t.unit_evidence[kind].known && t.unit_evidence[kind].kills > 0));
  if (!active) return null;
  const mean = key => others.reduce((sum, t) => sum + t.values[key] / others.length, 0);
  const references = { destruction: mean('destruction'), damage: mean('damage'), objectives: mean('objectives') };
  const cap=rule.score_cap??100,floor=rule.score_floor??0;
  const penalty=(value,reference,buffer)=>independentRatioPenalty(value,reference,buffer,cap,floor,rule.slope);
  const combatBase = 0.6 * penalty(v.destruction, references.destruction, rule.destruction_buffer) +
    0.4 * penalty(v.damage, references.damage, rule.damage_buffer);
  const exchangeBase = penalty(v.destruction, v.losses, rule.destruction_buffer);
  const objectiveCredit = rule.relief_cap * unit((v.objectives - references.objectives) / (references.objectives + rule.objectives_buffer));
  const specialistValues = ['heavy', 'air'].filter(kind => team.every(t => t.unit_evidence[kind].known)).map(kind => {
    const reference = others.reduce((sum, t) => sum + t.unit_evidence[kind].kills / others.length, 0);
    return {kind, kills:g.unit_evidence[kind].kills, reference,
      credit:rule.relief_cap * unit((g.unit_evidence[kind].kills - reference) / (reference + rule.specialist_buffer))};
  });
  const specialistCredit = Math.max(0, ...specialistValues.map(e => e.credit));
  const credit = Math.max(objectiveCredit, specialistCredit);
  const combatPenalty = Math.max(floor, combatBase - credit), exchangePenalty = Math.max(floor, exchangeBase - credit);
  const net_received = Math.max(0, v.received - v.supplied);
  const share = unit(net_received / Math.max(v.consumed, v.received, rule.supply_buffer));
  const excessSupply = unit((share - rule.free_supply_share) / (1 - rule.free_supply_share));
  // Only the food surcharge is conditional. Exchange never vanishes just because combat is adequate.
  const foodGap = unit((combatPenalty - rule.food_contribution_limit) / (100 - rule.food_contribution_limit));
  const penalties = {pressure:combatPenalty,exchange:exchangePenalty,dependency:100 * excessSupply * foodGap,
    discipline:100 * unit(v.friendly_fire / (v.damage + v.friendly_fire + 50) / rule.friendly_fire_limit)};
  const actualCredit = Math.max(combatBase - combatPenalty, exchangeBase - exchangePenalty);
  const objectiveRelief = objectiveCredit >= specialistCredit ? actualCredit : 0;
  const specialistRelief = specialistCredit > objectiveCredit ? actualCredit : 0;
  return {penalties,
    food:{net_received,share,contribution:100-combatPenalty,penalty:penalties.dependency},
    support:{available:specialistValues.length>0,credit:specialistRelief},
    evidence:{values:{...v},references,combat_base:combatBase,exchange_base:exchangeBase,
      ...(rule.score_cap?{item_cap:cap}:{}),
      ...(rule.score_floor!==undefined?{item_floor:floor}:{}),
      support_credit:credit,combat_penalty:combatPenalty,exchange_penalty:exchangePenalty,
      weak_combat:combatPenalty>50,weak_exchange:exchangePenalty>50,
      risk:combatPenalty>50||exchangePenalty>50||penalties.dependency>0||penalties.discipline>0,
      deficit:foodGap,supply_share:share,net_received,specialist_values:specialistValues,
      unavailable_specialists:2-specialistValues.length,objective_relief:objectiveRelief,specialist_relief:specialistRelief,
      relief_points:(combatBase-combatPenalty)*model.dimensions.find(d=>d.key==='pressure').weight/100+
        (exchangeBase-exchangePenalty)*model.dimensions.find(d=>d.key==='exchange').weight/100,penalties},
  };
}
