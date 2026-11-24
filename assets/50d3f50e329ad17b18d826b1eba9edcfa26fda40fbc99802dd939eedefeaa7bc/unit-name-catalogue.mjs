import {resolveUnitName,variantName} from './unit-icons.mjs';
import {matchPriceCatalogue} from './match-prices.mjs';

export function unitNameResolver(store){
  // The public database carries only names already resolved for each instance.
  if(store.get("SELECT data_json FROM analysis_catalogue WHERE key='unit_names_resolved'"))return Object.assign(r=>variantName(r.display_name),{preResolved:true});
  const row=store.get("SELECT data_json FROM analysis_catalogue WHERE key='unit_icon_variants'"),historyRow=store.get("SELECT data_json FROM analysis_catalogue WHERE key='unit_loadout_history'");
  const fallback=row?JSON.parse(row.data_json):null,history=historyRow?JSON.parse(historyRow.data_json):null,cache=new Map();
  return (r,base)=>{
    const release=matchPriceCatalogue(history,{start:typeof r.end_time==='number'&&r.duration>0?r.end_time-r.duration:null,end:r.end_time});
    const model=release?.icon_variants??fallback;if(!model)return null;
    const baseName=release?.units?.[r.unit_id]?.catalogue?.hudName??base?.hudName??base?.name;
    const key=JSON.stringify([release?.db_file??null,r.unit_id,r.option_ids,baseName]);
    if(!cache.has(key)){
      let ids=null;try{ids=JSON.parse(r.option_ids);}catch{}
      cache.set(key,resolveUnitName(ids,r.unit_id,model,baseName));
    }
    return cache.get(key);
  };
}
