const unit = n => Math.max(0, Math.min(1, n));

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

export function independentRatioPenalty(value, reference, buffer) {
  if ([value, reference, buffer].some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > Number.MAX_SAFE_INTEGER)) return null;
  if (value === reference) return 50;
  if (!value && !buffer) return 100;
  if (!reference && !buffer) return 0;
  return 100 * unit((50 - INDEPENDENT_RULES.slope * (Math.log2(value + buffer) - Math.log2(reference + buffer))) / 100);
}

export function independentEvidence(g, team, model) {
  const rule = model.context, v = g.values, others = team.filter(t => t.key !== g.key);
  if (!others.length) return null;
  const active = team.some(t => t.values.destruction > 0 || t.values.damage > 0 || t.values.objectives > 0 ||
    ['heavy', 'air'].some(kind => t.unit_evidence[kind].known && t.unit_evidence[kind].kills > 0));
  if (!active) return null;
  const mean = key => others.reduce((sum, t) => sum + t.values[key] / others.length, 0);
  const references = { destruction: mean('destruction'), damage: mean('damage'), objectives: mean('objectives') };
  const combatBase = 0.6 * independentRatioPenalty(v.destruction, references.destruction, rule.destruction_buffer) +
    0.4 * independentRatioPenalty(v.damage, references.damage, rule.damage_buffer);
  const exchangeBase = independentRatioPenalty(v.destruction, v.losses, rule.destruction_buffer);
  const objectiveCredit = rule.relief_cap * unit((v.objectives - references.objectives) / (references.objectives + rule.objectives_buffer));
  const specialistValues = ['heavy', 'air'].filter(kind => team.every(t => t.unit_evidence[kind].known)).map(kind => {
    const reference = others.reduce((sum, t) => sum + t.unit_evidence[kind].kills / others.length, 0);
    return {kind, kills:g.unit_evidence[kind].kills, reference,
      credit:rule.relief_cap * unit((g.unit_evidence[kind].kills - reference) / (reference + rule.specialist_buffer))};
  });
  const specialistCredit = Math.max(0, ...specialistValues.map(e => e.credit));
  const credit = Math.max(objectiveCredit, specialistCredit);
  const combatPenalty = Math.max(0, combatBase - credit), exchangePenalty = Math.max(0, exchangeBase - credit);
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
      support_credit:credit,combat_penalty:combatPenalty,exchange_penalty:exchangePenalty,
      weak_combat:combatPenalty>50,weak_exchange:exchangePenalty>50,
      risk:combatPenalty>50||exchangePenalty>50||penalties.dependency>0||penalties.discipline>0,
      deficit:foodGap,supply_share:share,net_received,specialist_values:specialistValues,
      unavailable_specialists:2-specialistValues.length,objective_relief:objectiveRelief,specialist_relief:specialistRelief,
      relief_points:(combatBase-combatPenalty)*model.dimensions.find(d=>d.key==='pressure').weight/100+
        (exchangeBase-exchangePenalty)*model.dimensions.find(d=>d.key==='exchange').weight/100,penalties},
  };
}
