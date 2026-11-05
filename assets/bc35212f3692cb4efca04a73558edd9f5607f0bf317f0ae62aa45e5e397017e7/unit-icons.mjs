export const ICON_VARIANT_VERSION='unit-icon-variants-v1';
export const iconName=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value)?value:null;
const id=n=>Number.isSafeInteger(n)&&n>=0;
export const variantName=value=>typeof value==='string'&&value.trim()&&value.length<=240&&!/[\u0000-\u001f\u007f]/.test(value)?value.trim():null;
const suffix=value=>typeof value==='string'&&variantName(value)?value:null;

// Explicit game fields only: never infer a vehicle variant from its display name.
export function compileIconVariants(tables,source=null){
  if(!['Units','Options','Modifications'].every(k=>Array.isArray(tables[k])))throw new Error('图标变体目录不完整');
  const units=new Map(tables.Units.map(u=>[u.Id,u])),slots=new Map(tables.Modifications.map(m=>[m.Id,m])),result={version:ICON_VARIANT_VERSION,source,units:{}};
  for(const o of tables.Options){
    const slot=slots.get(o.ModificationId),unit=units.get(slot?.UnitId);
    if(!id(o.Id)||!id(slot?.Id)||!id(unit?.Id))continue;
    const base=iconName(unit.ThumbnailFileName),replacement=units.get(o.ReplaceUnitId);
    const thumbnail=iconName(o.ThumbnailOverride)??(o.ReplaceUnitId>0?iconName(replacement?.ThumbnailFileName):null);
    const target=result.units[unit.Id]??={name:variantName(unit.HUDName)??variantName(unit.Name),options:{}};
    target.options[o.Id]={slot_id:slot.Id,slot_order:Number.isFinite(slot.Order)?slot.Order:slot.Id,thumbnail:thumbnail&&thumbnail!==base?thumbnail:null,
      replace_name:variantName(o.ReplaceUnitName)??(o.ReplaceUnitId>0&&o.ReplaceUnitId!==unit.Id?variantName(replacement?.HUDName)??variantName(replacement?.Name):null),suffix:suffix(o.ConcatenateWithUnitName)};
  }
  return result;
}

function selectedOptions(optionIds,unitId,model){
  if(model?.version!==ICON_VARIANT_VERSION||!Array.isArray(optionIds)||!optionIds.every(id)||new Set(optionIds).size!==optionIds.length)return null;
  const options=model.units?.[unitId]?.options;if(!options)return null;
  const slots=new Set(),selected=[];
  for(const optionId of optionIds){
    const o=options[optionId];if(!o||slots.has(o.slot_id))return null;
    slots.add(o.slot_id);selected.push(o);
  }
  return selected.sort((a,b)=>(a.slot_order??a.slot_id)-(b.slot_order??b.slot_id)||a.slot_id-b.slot_id);
}

export function resolveUnitIcon(optionIds,unitId,model){
  const selected=selectedOptions(optionIds,unitId,model);if(!selected)return null;
  const names=new Set(selected.map(o=>iconName(o.thumbnail)).filter(Boolean));
  // Conflicting overrides remain on the base icon instead of choosing arbitrarily.
  return names.size===1?[...names][0]:null;
}

export function resolveUnitName(optionIds,unitId,model,baseName=null){
  const selected=selectedOptions(optionIds,unitId,model);if(!selected)return null;
  if(selected.length!==new Set(Object.values(model.units[unitId].options).map(o=>o.slot_id)).size)return null;
  if(new Set(selected.map(o=>variantName(o.replace_name)).filter(Boolean)).size>1)return null;
  const base=variantName(baseName)??variantName(model.units[unitId].name);
  let name=base,changed=false;
  for(const option of selected){
    const replacement=variantName(option.replace_name),extra=suffix(option.suffix);
    if(replacement){name=replacement;changed=true;}
    // Preserve the source's leading space: "A1" joins directly, " Arena" does not.
    if(extra&&name){name+=extra;changed=true;}
  }
  const result=variantName(name?.replace(/\s+/g,' '));
  return changed&&result!==base?result:null;
}
