// Cross-match lists use current base names; match detail keeps its own release.
const fields=['id','hudName','name','categoryType','countryId','role','thumbnailFileName'];
export function publicDisplayCatalogue(model){
  return {version_name:model.version_name??null,updated_at:model.updated_at??null,
    units:Object.fromEntries(Object.entries(model.units??{}).map(([id,u])=>[id,Object.fromEntries(fields.filter(k=>['string','number'].includes(typeof u[k])).map(k=>[k,u[k]]))]))};
}
export function unitDisplayCatalogue(store){
  const row=store.get("SELECT data_json FROM analysis_catalogue WHERE key='unit_display_catalogue'");
  return row?publicDisplayCatalogue(JSON.parse(row.data_json)):{units:{}};
}
export const displayUnit=(model,id,base)=>model.units?.[id]?{...base,...model.units[id]}:base;
