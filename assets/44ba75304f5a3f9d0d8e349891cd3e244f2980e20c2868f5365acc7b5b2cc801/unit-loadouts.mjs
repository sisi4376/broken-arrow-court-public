const id=n=>Number.isSafeInteger(n)&&n>=0;
const money=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e6?n:null;
const label=(v,fallback)=>typeof v==='string'&&v.trim()?v.trim():fallback;
export const LOADOUT_VERSION='unit-loadouts-v1';

export function compileUnitLoadout(unit,translations={}){
  if(!id(unit?.id)||!Array.isArray(unit.modifications))throw new Error('单位挂载目录结构不完整');
  const name=(ui,raw)=>label(translations[String(ui).toLowerCase()],label(raw,label(ui,'未命名')));
  return {id:unit.id,base_cost:money(unit.cost),slots:unit.modifications.map(m=>{
    if(!id(m.id)||!Array.isArray(m.options))throw new Error('单位挂载槽结构不完整');
    return {id:m.id,name:name(m.uiName,m.name),options:m.options.map(o=>{
      if(!id(o.id))throw new Error('单位挂载 ID 非法');
      return {id:o.id,name:name(o.uiName,o.name),cost:money(o.cost)};
    })};
  })};
}

export function resolveUnitLoadout(optionIds,unit,model={}){
  const result={version:LOADOUT_VERSION,db_file:model.db_file??null,updated_at:model.updated_at??null,
    base_cost:unit?.base_cost??null,cost:null,status:'unknown',options:[]};
  if(!Array.isArray(optionIds)||!optionIds.every(id)||new Set(optionIds).size!==optionIds.length)return result;
  const selected=new Set(optionIds),known=new Set();let complete=!!unit,extra=0;
  for(const s of unit?.slots??[]){
    for(const o of s.options)known.add(o.id);
    const choices=s.options.filter(o=>selected.has(o.id));
    // Never substitute a default: the replay must identify the selected option.
    if(choices.length!==1)complete=false;
    for(const o of choices){result.options.push({id:o.id,slot:s.name,name:o.name,cost:o.cost});if(o.cost===null)complete=false;else extra+=o.cost;}
  }
  for(const n of optionIds)if(!known.has(n)){complete=false;result.options.push({id:n,slot:'未解析',name:`挂载 #${n}`,cost:null});}
  const total=result.base_cost===null?null:money(result.base_cost+extra);
  if(complete&&total!==null&&total>=0){result.cost=total;result.status='complete';}
  return result;
}

// A strict public projection, not an arbitrary upstream catalogue graph.
export function publicUnitLoadout(value){
  if(!value||value.version!==LOADOUT_VERSION)return null;
  return {version:LOADOUT_VERSION,db_file:label(value.db_file,null),updated_at:label(value.updated_at,null),
    base_cost:money(value.base_cost),cost:value.status==='complete'&&money(value.cost)!==null&&value.cost>=0?value.cost:null,
    status:value.status==='complete'?'complete':'unknown',options:(value.options??[]).filter(o=>id(o.id)).map(o=>({id:o.id,slot:label(o.slot,''),name:label(o.name,`挂载 #${o.id}`),cost:money(o.cost)}))};
}
