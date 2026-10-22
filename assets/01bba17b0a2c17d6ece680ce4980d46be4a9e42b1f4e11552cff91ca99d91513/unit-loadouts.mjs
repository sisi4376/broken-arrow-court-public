const id=n=>Number.isSafeInteger(n)&&n>=0;
const money=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e6?n:null;
const label=(v,fallback)=>typeof v==='string'&&v.trim()?v.trim():fallback;
export const LOADOUT_VERSION='unit-loadouts-v1';

export function compileUnitLoadout(unit,translations={}){
  if(!id(unit?.id)||!Array.isArray(unit.modifications))throw new Error('单位挂载目录结构不完整');
  const name=(ui,raw)=>label(translations[String(ui).toLowerCase()],typeof ui==='string'&&!/^Custom_/i.test(ui)?label(ui,label(raw,'未命名')):label(raw,label(ui,'未命名')));
  return {id:unit.id,base_cost:money(unit.cost),slots:unit.modifications.map(m=>{
    if(!id(m.id)||!Array.isArray(m.options))throw new Error('单位挂载槽结构不完整');
    return {id:m.id,name:name(m.uiName,m.name),options:m.options.map(o=>{
      if(!id(o.id))throw new Error('单位挂载 ID 非法');
      return {id:o.id,key:label(o.name,String(o.id)),name:name(o.uiName,o.name),cost:money(o.cost)};
    })};
  })};
}

function inspect(optionIds,unit,model={}){
  const result={version:LOADOUT_VERSION,db_file:model.db_file??null,updated_at:model.updated_at??null,
    base_cost:unit?.base_cost??null,cost:null,status:'unknown',resolution:'unknown',basis:'current',issues:[],missing_slots:[],options:[]};
  if(!Array.isArray(optionIds)||!optionIds.every(id)||new Set(optionIds).size!==optionIds.length){result.issues.push('invalid_options');return result;}
  if(!unit)result.issues.push('missing_catalogue');
  const selected=new Set(optionIds),known=new Set();let complete=!!unit,extra=0;
  for(const s of unit?.slots??[]){
    for(const o of s.options)known.add(o.id);
    const choices=s.options.filter(o=>selected.has(o.id));
    // Never substitute a default: the replay must identify the selected option.
    if(choices.length!==1){complete=false;result.issues.push(choices.length?'conflicting_options':'missing_slot');if(!choices.length)result.missing_slots.push({id:s.id,name:s.name});}
    for(const o of choices){result.options.push({id:o.id,slot_id:s.id,slot:s.name,key:o.key??o.name,name:o.name,cost:o.cost,...(o.source?{source:o.source}:{})});if(o.cost===null)result.issues.push('missing_cost');else extra+=o.cost;}
  }
  for(const n of optionIds)if(!known.has(n)){complete=false;result.issues.push('unknown_option');result.options.push({id:n,slot:'未解析',name:`挂载 #${n}`,cost:null});}
  result.resolution=complete?'complete':result.options.some(o=>o.slot_id!==undefined)?'partial':'unknown';
  const total=result.base_cost===null?null:money(result.base_cost+extra);
  if(result.base_cost===null)result.issues.push('missing_cost');
  if(complete&&!result.issues.includes('missing_cost')&&total!==null&&total>=0){result.cost=total;result.status='complete';}
  result.issues=[...new Set(result.issues)];
  return result;
}

export function resolveUnitLoadout(optionIds,unit,model={}){
  const history=model.history??{},supplements=history.supplements??[];
  if(unit&&supplements.some(s=>s.unit_id===unit.id))unit={...unit,slots:unit.slots.map(slot=>({...slot,options:[...slot.options,...supplements.filter(s=>s.unit_id===unit.id&&s.slot_id===slot.id&&!slot.options.some(o=>o.id===s.option.id)).map(s=>({...s.option,source:'game_extract'}))]}))};
  const current=inspect(optionIds,unit,model);
  if(current.resolution==='complete'){
    if(current.options.some(o=>o.source==='game_extract'))current.basis='supplement';
    return current;
  }
  if(current.issues.includes('invalid_options')||current.issues.includes('conflicting_options'))return current;
  const candidates=(history.catalogues??[]).filter(c=>!c.experimental&&c.units?.[unit?.id??model.unit_id]).map(c=>({catalogue:c,result:inspect(optionIds,c.units[unit?.id??model.unit_id],{db_file:c.db_file,updated_at:c.updated_at})})).filter(c=>c.result.resolution==='complete');
  if(!candidates.length)return current;
  const signature=r=>JSON.stringify(r.options.map(o=>[o.id,o.slot_id,o.key]).sort((a,b)=>a[0]-b[0]));
  if(new Set(candidates.map(c=>signature(c.result))).size!==1){current.issues.push('ambiguous_history');return current;}
  const result={...candidates[0].result,basis:'historical',catalogue_versions:candidates.map(c=>({db_file:c.catalogue.db_file,name:c.catalogue.name})),updated_at:history.updated_at??model.updated_at};
  // Identical IDs/layout do not prove which patch the match used. Prices must agree.
  if(candidates.some(c=>c.result.cost===null)||new Set(candidates.map(c=>c.result.cost)).size!==1){
    result.cost=null;result.status='unknown';result.issues=['ambiguous_price'];
    if(new Set(candidates.map(c=>c.result.base_cost)).size!==1)result.base_cost=null;
    for(const o of result.options)if(new Set(candidates.map(c=>c.result.options.find(x=>x.id===o.id)?.cost)).size!==1)o.cost=null;
  }
  if(candidates.length>1)result.db_file=null;
  return result;
}

// A strict public projection, not an arbitrary upstream catalogue graph.
export function publicUnitLoadout(value){
  if(!value||value.version!==LOADOUT_VERSION)return null;
  return {version:LOADOUT_VERSION,db_file:label(value.db_file,null),updated_at:label(value.updated_at,null),
    base_cost:money(value.base_cost),cost:value.status==='complete'&&money(value.cost)!==null&&value.cost>=0?value.cost:null,
    status:value.status==='complete'?'complete':'unknown',resolution:['complete','partial'].includes(value.resolution)?value.resolution:'unknown',basis:['historical','supplement'].includes(value.basis)?value.basis:'current',
    issues:(value.issues??[]).filter(s=>['invalid_options','missing_catalogue','conflicting_options','missing_slot','unknown_option','missing_cost','ambiguous_history','ambiguous_price'].includes(s)),
    missing_slots:(value.missing_slots??[]).filter(s=>id(s.id)).map(s=>({id:s.id,name:label(s.name,'未知槽位')})),
    catalogue_versions:(value.catalogue_versions??[]).map(c=>({db_file:label(c.db_file,null),name:label(c.name,'历史版本')})),
    options:(value.options??[]).filter(o=>id(o.id)).map(o=>({id:o.id,slot:label(o.slot,''),name:label(o.name,`挂载 #${o.id}`),cost:money(o.cost),...(o.source==='game_extract'?{source:'game_extract'}:{})}))};
}
