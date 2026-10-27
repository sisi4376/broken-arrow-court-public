import { mapName } from './domain.mjs';
import { resolveUnitLoadout, publicUnitLoadout } from './unit-loadouts.mjs';
import { matchPriceCatalogue } from './match-prices.mjs';
import { resolveUnitName, variantName } from './unit-icons.mjs';

export const SELF_DESTRUCTION_VERSION = 'self-destruction-v3-score';
export const SELF_CONFIRMED_SQL = `(json_type(u.raw_json,'$.SelfDestruction')='true' OR (
  json_type(u.raw_json,'$.SelfDestruction') IS NULL AND
  json_type(u.raw_json,'$.TotalSelfDamageDealt') IN ('integer','real') AND
  json_extract(u.raw_json,'$.TotalSelfDamageDealt')=-1 AND COALESCE(u.death_time,0)<=0))`;

export function selfDestructionUnit(u) {
  const loadout=publicUnitLoadout(u.loadout);
  const metric=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER?n:null;
  return {player_id:String(u.player_id),net_id:String(u.net_id),unit_id:String(u.unit_id),
    name:variantName(u.display_name)??variantName(u.catalogue?.hudName)??variantName(u.catalogue?.uiName)??variantName(u.catalogue?.name)??`兵牌 #${u.unit_id}`,
    option_ids:Array.isArray(u.raw?.OptionIds)?u.raw.OptionIds.filter(n=>Number.isSafeInteger(n)&&n>=0):[],loadout,
    score:loadout?.price_bound&&loadout.status==='complete'?loadout.cost:null,
    spawn_time:metric(u.spawn_time),death_time:metric(u.death_time),kills:metric(u.kills),damage:metric(u.damage)};
}

function confirmedUnits(store,f){
  const read=key=>{const row=store.get('SELECT data_json FROM analysis_catalogue WHERE key=?',key);return row?JSON.parse(row.data_json):null;};
  const model=read('unit_loadouts'),history=read('unit_loadout_history'),icons=read('unit_icon_variants');
  const projected=read('unit_names_resolved')===true,contexts=new Map(),matches=new Map();
  const rows=store.all(`SELECT r.member_id,u.*,c.data_json AS catalogue_json
    FROM unit_instances u JOIN registered_participants r ON r.match_id=u.match_id AND r.player_id=u.player_id
    JOIN matches m ON m.id=u.match_id LEFT JOIN unit_catalogue c ON c.unit_id=u.unit_id
    WHERE ${f.sql} AND u.refunded=0 AND ${SELF_CONFIRMED_SQL}
    ORDER BY u.match_id,r.member_id,u.player_id,u.spawn_time,u.net_id`,...f.args);
  for(const u of rows){
    const raw=JSON.parse(u.raw_json),catalogue=u.catalogue_json?JSON.parse(u.catalogue_json):null;
    let loadout,display_name;
    if(projected){
      loadout=raw.AnalysisSelfDestruction?.loadout;
      display_name=raw.AnalysisSelfDestruction?.name??raw.AnalysisDisplayName;
    }else if(model){
      if(!contexts.has(u.match_id)){
        const m=store.get('SELECT * FROM matches WHERE id=?',u.match_id),detail=m.detail_json?JSON.parse(m.detail_json):null;
        const start=typeof detail?.data?.StartTime==='number'?detail.data.StartTime:
          typeof m.end_time==='number'&&typeof m.duration==='number'&&m.duration>0?m.end_time-m.duration:null;
        contexts.set(u.match_id,matchPriceCatalogue(history??model.history,{start,end:m.end_time}));
      }
      const price_catalogue=contexts.get(u.match_id);
      // No dated catalogue means an unknown historical price, not today's price.
      loadout=resolveUnitLoadout(raw.OptionIds,model.units?.[u.unit_id],{...model,history,unit_id:Number(u.unit_id),price_catalogue:price_catalogue??null});
      const names=price_catalogue?.units[u.unit_id]?.catalogue??catalogue;
      display_name=resolveUnitName(raw.OptionIds,u.unit_id,price_catalogue?.icon_variants??icons,names?.hudName??names?.uiName??names?.name)??names?.hudName??names?.uiName??names?.name;
    }
    const key=JSON.stringify([u.member_id,u.match_id]),list=matches.get(key)??[];
    list.push(selfDestructionUnit({...u,raw,catalogue,loadout,display_name}));matches.set(key,list);
  }
  return matches;
}

export function selfDestructionStats(store, f) {
  const rows = store.all(`WITH selected_matches AS (
    SELECT m.id,m.end_time,m.map_id,m.detail_state FROM matches m WHERE ${f.sql}
  ),lifecycle AS (
    SELECT u.match_id,MAX(u.spawn_time>0 OR u.death_time>0) AS supported
    FROM unit_instances u JOIN selected_matches m ON m.id=u.match_id GROUP BY u.match_id
  ),accounts AS (
    SELECT r.member_id,r.player_id,r.match_id,m.end_time,m.map_id,m.detail_state,
      CASE WHEN json_type(r.raw_json,'$.Losses') IS NULL THEN 0
        WHEN json_type(r.raw_json,'$.Losses') IN ('integer','real') AND json_extract(r.raw_json,'$.Losses') BETWEEN 0 AND 9007199254740991
          AND CAST(json_extract(r.raw_json,'$.Losses') AS INTEGER)=json_extract(r.raw_json,'$.Losses')
        THEN json_extract(r.raw_json,'$.Losses') END AS reported_losses,
      SUM(CASE WHEN u.death_time>0 AND u.refunded=0 THEN 1 ELSE 0 END) AS recorded_deaths,
      SUM(CASE WHEN u.net_id IS NOT NULL AND json_type(u.raw_json,'$.SelfDestruction') IS NOT NULL
        AND json_type(u.raw_json,'$.SelfDestruction') NOT IN ('true','false') THEN 1 ELSE 0 END) AS invalid_units,
      SUM(CASE WHEN u.refunded=0 AND ${SELF_CONFIRMED_SQL} THEN 1 ELSE 0 END) AS confirmed,
      SUM(CASE WHEN u.refunded=0 AND json_type(u.raw_json,'$.SelfDestruction') IS NULL AND ${SELF_CONFIRMED_SQL} THEN 1 ELSE 0 END) AS compatible,
      COALESCE(l.supported,0) AS has_lifecycle
    FROM registered_participants r JOIN selected_matches m ON m.id=r.match_id
    LEFT JOIN lifecycle l ON l.match_id=m.id
    LEFT JOIN unit_instances u ON u.match_id=r.match_id AND u.player_id=r.player_id
    GROUP BY r.member_id,r.player_id,r.match_id
  ) SELECT member_id,match_id,end_time,map_id,SUM(confirmed) AS confirmed,SUM(compatible) AS compatible,
    MAX(CASE WHEN detail_state!='complete' THEN 1 ELSE 0 END) AS missing_detail,
    MAX(invalid_units>0) AS invalid,
    MAX(CASE WHEN has_lifecycle=0 THEN 1 ELSE 0 END) AS missing_lifecycle,
    MAX(CASE WHEN reported_losses IS NULL OR reported_losses>recorded_deaths THEN 1 ELSE 0 END) AS missing_deaths
    FROM accounts GROUP BY member_id,match_id ORDER BY end_time DESC,match_id DESC`, ...f.args);
  const details=confirmedUnits(store,f),members = new Map();
  for (const r of rows) {
    let m = members.get(r.member_id);
    if (!m) { m = { samples: 0, total: 0, ranked: 0, compatible: 0, excluded: 0, score:0,ranked_score:0,score_samples:0,score_excluded:0,unpriced:0,cases: [], unknown: [] }; members.set(r.member_id, m); }
    const reason = r.missing_detail ? 'missing_detail' : r.invalid ? 'invalid_flag' : r.missing_lifecycle ? 'missing_lifecycle' : r.missing_deaths ? 'missing_death_records' : null;
    const units=details.get(JSON.stringify([r.member_id,r.match_id]))??[];
    const unpriced=units.filter(u=>u.score===null).length,known_score=units.reduce((sum,u)=>sum+(u.score??0),0);
    const score_reason=reason??(unpriced?'missing_unit_price':null);
    const entry = { match_id: r.match_id, end_time: r.end_time, map_name: mapName(r.map_id), count: r.confirmed, compatible: r.compatible, coverage: reason ? 'partial' : 'audited',
      units,known_score,score:unpriced?null:known_score,unpriced_units:unpriced,score_coverage:score_reason?'partial':'audited' };
    m.total += r.confirmed; m.compatible += r.compatible;
    m.score+=known_score;m.unpriced+=unpriced;
    if (r.confirmed) m.cases.push(entry);
    if(score_reason){m.score_excluded++;m.unknown.push({...entry,reason:score_reason});}
    else{m.score_samples++;m.ranked_score+=known_score;}
    if (reason) { m.excluded++; }
    else { m.samples++; m.ranked += r.confirmed; }
  }
  return { version: SELF_DESTRUCTION_VERSION, members };
}
