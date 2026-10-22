export const ICON_VARIANT_VERSION='unit-icon-variants-v1';
export const iconName=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value)?value:null;
const id=n=>Number.isSafeInteger(n)&&n>=0;

// Explicit game fields only: never infer a vehicle variant from its display name.
export function compileIconVariants(tables,source=null){
  if(!['Units','Options','Modifications'].every(k=>Array.isArray(tables[k])))throw new Error('图标变体目录不完整');
  const units=new Map(tables.Units.map(u=>[u.Id,u])),slots=new Map(tables.Modifications.map(m=>[m.Id,m])),result={version:ICON_VARIANT_VERSION,source,units:{}};
  for(const o of tables.Options){
    const slot=slots.get(o.ModificationId),unit=units.get(slot?.UnitId);
    if(!id(o.Id)||!id(slot?.Id)||!id(unit?.Id))continue;
    const base=iconName(unit.ThumbnailFileName),replacement=units.get(o.ReplaceUnitId);
    const thumbnail=iconName(o.ThumbnailOverride)??(o.ReplaceUnitId>0?iconName(replacement?.ThumbnailFileName):null);
    const target=result.units[unit.Id]??={options:{}};
    target.options[o.Id]={slot_id:slot.Id,thumbnail:thumbnail&&thumbnail!==base?thumbnail:null};
  }
  return result;
}

export function resolveUnitIcon(optionIds,unitId,model){
  if(model?.version!==ICON_VARIANT_VERSION||!Array.isArray(optionIds)||!optionIds.every(id)||new Set(optionIds).size!==optionIds.length)return null;
  const options=model.units?.[unitId]?.options;if(!options)return null;
  const slots=new Set(),names=new Set();
  for(const selected of optionIds){
    const o=options[selected];if(!o||slots.has(o.slot_id))return null;
    slots.add(o.slot_id);const name=iconName(o.thumbnail);if(name)names.add(name);
  }
  // Conflicting overrides remain on the base icon instead of choosing arbitrarily.
  return names.size===1?[...names][0]:null;
}
