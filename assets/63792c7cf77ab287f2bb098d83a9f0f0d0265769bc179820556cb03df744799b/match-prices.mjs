// Live 1.2.1 deployment began at 13:00 CEST. Matches spanning maintenance
// cannot be assigned a price version from their timestamps alone.
export const LIVE_121_AT=Date.parse('2026-10-20T11:00:00Z')/1000;
export const PATCH_121_SOURCE='https://steamcommunity.com/app/1604270';
export const PRE_121_DB='unit_data_20260830_2.db';

export function matchPriceCatalogue(history,{start,end}={}){
  const versions=history?.price_catalogues;
  if(!Array.isArray(versions)||!versions.length)return undefined;
  const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
  if(!valid(end)||!valid(start)||start>end)return null;
  const matches=versions.filter(c=>!c.experimental&&
    (c.valid_from===undefined||start>=c.valid_from)&&
    (c.valid_until===undefined||end<=c.valid_until));
  return matches.length===1?matches[0]:null;
}

// All changes are pinned to the old catalogue IDs and old prices. A failed
// precondition stops the import instead of quietly applying a delta twice.
export function compilePatch121(baseline){
  if(baseline.db_file!==PRE_121_DB)throw Error('1.2.1 调价需要已归档的 1.2.0_od 目录');
  const result=structuredClone(baseline),changes=[];
  delete result.valid_until;delete result.valid_from;
  const base=(id,old,next)=>{
    const u=result.units[id];if(!u)return;
    if(u.base_cost!==old)throw Error(`单位 ${id} 的旧版基价不匹配`);
    u.base_cost=next;changes.push({unit_id:id,base_cost:next});
  };
  const option=(id,oid,old,next)=>{
    const u=result.units[id];if(!u)return;
    const o=u.slots.flatMap(s=>s.options).find(o=>o.id===oid);
    if(!o||o.cost!==old)throw Error(`单位 ${id} 挂载 ${oid} 的旧版价格不匹配`);
    o.cost=next;changes.push({unit_id:id,option_id:oid,cost:next});
  };
  for(const args of [[135,30,40],[628,45,50],[93,275,250],[97,200,175],
    [223,275,265],[198,200,220],[224,300,280],[226,250,225],
    [376,250,200],[190,300,340],[11,200,175],[315,180,220],[632,50,65],[395,200,180]])base(...args);
  for(const args of [[135,3055,20,0],[222,1899,30,25],[230,536,55,25],
    [628,3070,5,10],[628,3069,10,15],[628,3071,10,15],[628,3068,15,20],
    [93,1981,25,100],[93,1982,25,100],[97,3018,25,115],[97,3019,25,115],
    [223,3133,50,25],[198,438,50,30],[226,529,75,50],
    [376,1675,25,40],[376,1676,25,40],[190,1604,25,-65],
    [11,110,25,90],[11,111,25,90],[11,1603,50,50],
    [143,3315,50,60],[19,2096,60,50],[19,143,100,90],[19,139,100,90],
    [311,1301,130,90],[311,1294,130,90],[292,1864,130,90],
    [294,1941,80,50],[294,1940,80,50],[370,3116,5,0]])option(...args);
  for(const [id,u]of Object.entries(result.units))for(const s of u.slots)for(const o of s.options){
    let next;
    if(/\b[24]xR60\b/i.test(o.key))next=({30:20,55:30})[o.cost];
    if(/Kh38ML/i.test(o.key)&&o.cost===60)next=50;
    if(/Kh-29TD/i.test(o.name)&&o.cost===80)next=50;
    if(/\b[246]xAGM65\b/i.test(o.key))next=({60:50,90:75,120:100})[o.cost];
    if(/\b[348]xSDB2\b/i.test(o.key))next=({25:15,30:20,50:30})[o.cost];
    if(next!==undefined){changes.push({unit_id:Number(id),option_id:o.id,cost:next});o.cost=next;}
  }
  // These units received new/removed slots or new weapon IDs. The patch notes
  // do not disclose the new IDs, so wait for an actual 1.2.1 table for them.
  for(const id of [57,146,371,270,86,272,282,289])if(result.units[id]){
    result.units[id].price_pending=true;result.units[id].base_cost=null;
    for(const s of result.units[id].slots)for(const o of s.options)o.cost=null;
  }
  return {...result,version_name:'1.2.1',db_file:'official-1.2.1-from-'+PRE_121_DB,
    price_source:'official_patch',source_url:PATCH_121_SOURCE,valid_from:LIVE_121_AT,
    changes,updated_at:new Date().toISOString()};
}
