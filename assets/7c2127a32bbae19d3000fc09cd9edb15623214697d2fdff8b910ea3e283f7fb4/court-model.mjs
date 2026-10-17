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
