import {matchPriceCatalogue} from './match-prices.mjs';

export const AIR_MODEL_VERSION='air-superiority-v1';
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const planeRole=n=>Number.isInteger(Number(n))&&Number(n)>=160&&Number(n)<=164;
const text=(value,fallback='')=>typeof value==='string'?value:fallback;

export function compileAirUnit(unit) {
  if(!integer(unit?.id)||!planeRole(unit.role)||!Array.isArray(unit.turrets)||!Array.isArray(unit.modifications))throw new Error('飞机完整目录结构不完整');
  const turrets={},defaults=[];
  for(const row of unit.turrets){
    const t=row.turret;if(!integer(t?.id)||!Array.isArray(t.weapons))throw new Error('飞机武器目录缺失');
    let valid=true;const types=[];
    for(const row of t.weapons){
      const w=row.weapon;
      if(!integer(w?.type)||!Array.isArray(w.ammunition)){valid=false;continue;}
      if(w.ammunition.some(a=>!integer(a.quantity))){valid=false;continue;}
      if(w.ammunition.some(a=>a.quantity>0))types.push(w.type);
    }
    turrets[t.id]={types:[...new Set(types)],valid};if(t.isDefault===true)defaults.push(t.id);
  }
  const referenced=new Set();
  const modifications=unit.modifications.map(m=>{
    if(!integer(m.id)||!Array.isArray(m.options)||!m.options.length)throw new Error('飞机挂载槽目录缺失');
    return {id:m.id,name:text(m.name),options:m.options.map(o=>{
      if(!integer(o.id))throw new Error('挂载选项 ID 非法');
      const slots={};
      for(let i=0;i<=20;i++)if(o[`turret${i}Id`]!=null){
        const id=o[`turret${i}Id`];if(!integer(id))throw new Error('挂载武器 ID 非法');slots[i]=id;referenced.add(id);
      }
      return {id:o.id,name:text(o.uiName,text(o.name,String(o.id))),slots,replace_unit_id:o.replaceUnitId??0};
    })};
  });
  return {id:unit.id,name:text(unit.hudName,text(unit.name,String(unit.id))),role:Number(unit.role),
    base_turrets:defaults.filter(id=>!referenced.has(id)),turrets,modifications};
}

// Only the normalized game catalogue is public, never arbitrary source fields.
export function publicAirModel(model) {
  const units={};
  for(const[id,u]of Object.entries(model?.units??{})){
    units[id]={id:u.id,name:u.name,role:u.role,base_turrets:u.base_turrets,
      turrets:Object.fromEntries(Object.entries(u.turrets??{}).map(([id,t])=>[id,{types:t.types,valid:t.valid}])),
      modifications:(u.modifications??[]).map(m=>({id:m.id,name:m.name,options:m.options.map(o=>({id:o.id,name:o.name,slots:o.slots,replace_unit_id:o.replace_unit_id}))}))};
  }
  return {version:model?.version??AIR_MODEL_VERSION,db_file:model?.db_file??null,version_id:model?.version_id??null,updated_at:model?.updated_at??null,units,
    ...(model?.version_name?{version_name:model.version_name}:{}),
    ...(Number.isFinite(model?.valid_from)?{valid_from:model.valid_from}:{}),...(Number.isFinite(model?.valid_until)?{valid_until:model.valid_until}:{}),
    ...(model?.roles?{roles:Object.fromEntries(Object.entries(model.roles).filter(([id,role])=>/^\d+$/.test(id)&&integer(role)))}:{}),
    ...(model?.catalogues?{catalogues:model.catalogues.map(c=>publicAirModel(c))}:{})};
}

export function classifyAirLoadout(raw,unit) {
  const unknown=reason=>({status:'unknown',reason});
  if(!unit)return unknown('missing_model');
  const ids=raw?.OptionIds;
  if(!Array.isArray(ids)||!ids.every(integer)||new Set(ids).size!==ids.length)return unknown('invalid_options');
  const selected=new Set(ids),known=new Set(),slots=new Map(),loadout=[];
  let unresolved=null;
  for(const m of unit.modifications){
    for(const o of m.options)known.add(o.id);
    const options=m.options.filter(o=>selected.has(o.id));
    if(options.length>1)return unknown('conflicting_options');
    if(!options.length){unresolved??='missing_slot';continue;}
    const o=options[0];if(o.replace_unit_id)return unknown('replacement_unit');
    loadout.push(o.name);
    for(const[slot,id]of Object.entries(o.slots)){
      if(slots.has(slot)&&slots.get(slot)!==id)return unknown('conflicting_slots');
      slots.set(slot,id);
    }
  }
  if(ids.some(id=>!known.has(id)))unresolved??='unknown_option';
  const types=new Set();
  for(const id of new Set([...unit.base_turrets,...slots.values()])){
    const turret=unit.turrets[id];
    if(!turret?.valid){unresolved??='missing_weapon';continue;}
    for(const type of turret.types)types.add(type);
  }
  // A confirmed ground weapon rules out a pure air-to-air loadout even if another slot is unknown.
  if([...types].some(t=>![87,88,116].includes(t)))return {status:'not_eligible',reason:'ground_weapon',loadout,weapon_types:[...types],option_ids:ids};
  if(unresolved)return unknown(unresolved);
  const eligible=[...types].some(t=>t===87||t===88);
  return {status:eligible?'eligible':'not_eligible',reason:eligible?null:'not_air_to_air_only',loadout,weapon_types:[...types],option_ids:[...ids].sort((a,b)=>a-b)};
}

export function airSuperiorityStats(store,f) {
  const row=store.get("SELECT data_json FROM analysis_catalogue WHERE key='air_superiority_model'");
  const model=row?JSON.parse(row.data_json):{version:AIR_MODEL_VERSION,units:{}};
  const games=new Map();
  for(const r of store.all(`SELECT DISTINCT r.member_id,r.match_id,m.end_time,m.duration FROM registered_participants r JOIN matches m ON m.id=r.match_id WHERE ${f.sql} AND m.detail_state='complete'`,...f.args)){
    const selected=matchPriceCatalogue({price_catalogues:model.catalogues},{start:typeof r.end_time==='number'&&r.duration>0?r.end_time-r.duration:null,end:r.end_time});
    games.set(`${r.member_id}:${r.match_id}`,{...r,catalogue:selected===undefined?model:selected,unknown:false,units:[]});
  }
  const rows=store.all(`SELECT r.member_id,u.match_id,u.unit_id,u.kills,u.raw_json,c.data_json AS catalogue_json
    FROM unit_instances u JOIN registered_participants r ON r.match_id=u.match_id AND r.player_id=u.player_id
    JOIN matches m ON m.id=u.match_id LEFT JOIN unit_catalogue c ON c.unit_id=u.unit_id
    WHERE ${f.sql} AND m.detail_state='complete'`,...f.args);
  const unknownReasons={},evaluations=new Map();
  for(const r of rows){
    const g=games.get(`${r.member_id}:${r.match_id}`),c=r.catalogue_json?JSON.parse(r.catalogue_json):null;
    let result;const role=g.catalogue?.roles?.[r.unit_id]??c?.role;
    if(!['number','string'].includes(typeof role)||!integer(Number(role))||(typeof role==='string'&&!/^\d+$/.test(role)))result={status:'unknown',reason:'unknown_unit_role'};
    else if(!planeRole(role))continue;
    else if(!g.catalogue)result={status:'unknown',reason:'match_version_unknown'};
    else {
      const raw=JSON.parse(r.raw_json),key=g.catalogue.db_file+':'+r.unit_id+':'+JSON.stringify(raw.OptionIds);
      result=evaluations.get(key);
      if(!result){result=classifyAirLoadout(raw,g.catalogue.units[r.unit_id]);evaluations.set(key,result);}
    }
    if(result.status==='eligible'&&!integer(r.kills))result={status:'unknown',reason:'invalid_kills'};
    if(result.status==='unknown'){g.unknown=true;unknownReasons[result.reason]=(unknownReasons[result.reason]??0)+1;continue;}
    if(result.status==='eligible')g.units.push({unit_id:r.unit_id,name:g.catalogue.units[r.unit_id].name,catalogue_version:g.catalogue.version_name,kills:r.kills,...result});
  }
  const members=new Map();
  for(const g of games.values()){
    let m=members.get(g.member_id);
    if(!m){m={matches:0,excluded:0,kills:0,units:new Map()};members.set(g.member_id,m);}
    if(g.unknown){m.excluded++;continue;}m.matches++;
    for(const u of g.units){
      m.kills+=u.kills;const key=`${u.catalogue_version??''}:${u.unit_id}:${u.option_ids.join(',')}`;
      let total=m.units.get(key);
      if(!total){total={unit_id:u.unit_id,name:u.name,catalogue_version:u.catalogue_version,option_ids:u.option_ids,loadout:u.loadout,kills:0,deployments:0};m.units.set(key,total);}
      total.kills+=u.kills;total.deployments++;
    }
  }
  return {model:{version:model.version,updated_at:model.updated_at??null,db_file:model.db_file??null,units:Object.keys(model.units).length,unknown_units:unknownReasons,
    ...(model.catalogues?{catalogues:model.catalogues.map(c=>({version_name:c.version_name,db_file:c.db_file,valid_from:c.valid_from??null,valid_until:c.valid_until??null,units:Object.keys(c.units).length}))}:{})},members};
}

export async function updateAirCatalogue(store,source,{force=false,allowed=()=>true,onProgress=()=>{}}={}) {
  const row=store.get("SELECT data_json,updated_at FROM analysis_catalogue WHERE key='air_superiority_model'");
  let model=row?JSON.parse(row.data_json):{version:AIR_MODEL_VERSION,units:{}};
  const ids=store.all("SELECT unit_id FROM unit_catalogue WHERE CAST(json_extract(data_json,'$.role') AS INTEGER) BETWEEN 160 AND 164 ORDER BY CAST(unit_id AS INTEGER)").map(r=>r.unit_id);
  const refresh=force||!model.updated_at||Date.now()-Date.parse(model.updated_at)>7*86400000;
  let needed=ids.filter(id=>refresh||!model.units[id]);
  if(!needed.length||!allowed())return {updated:0,total:Object.keys(model.units).length};
  if(!force&&model.last_error_at&&Date.now()-Date.parse(model.last_error_at)<3600000)return {updated:0,total:Object.keys(model.units).length};
  const version=await source.read('/api/dek/db-version');
  if(typeof version.dbFileName!=='string'||!version.dbFileName)throw new Error('飞机目录版本信息缺失');
  if(model.db_file&&model.db_file!==version.dbFileName){model={version:AIR_MODEL_VERSION,units:{},...(model.catalogues?{catalogues:model.catalogues}:{})};needed=ids;}
  model={...model,db_file:version.dbFileName,version_id:version.versionId??null,last_attempt:new Date().toISOString()};
  let updated=0;
  try {
    for(const id of needed){
      if(!allowed())break;
      const query=new URLSearchParams({unitid:id,db_file:version.dbFileName});
      const data=await source.read('/api/units/full?'+query);
      if(String(data.unit?.id)!==id)throw new Error('飞机完整目录 ID 不匹配');
      model.units[id]=compileAirUnit(data.unit);updated++;
      onProgress({unit_id:id,name:model.units[id].name,updated,total:needed.length});
    }
    delete model.last_error_at;
  } catch(error){
    model.last_error_at=new Date().toISOString();throw error;
  } finally {
    if(updated)model.updated_at=new Date().toISOString();
    store.run("INSERT INTO analysis_catalogue(key,data_json,updated_at) VALUES('air_superiority_model',?,?) ON CONFLICT(key) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at",JSON.stringify(model),new Date().toISOString());
  }
  return {updated,total:Object.keys(model.units).length};
}

