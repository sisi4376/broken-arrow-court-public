import { mapName } from './domain.mjs';

export const SELF_DESTRUCTION_VERSION = 'self-destruction-v2-evidence';
export const SELF_CONFIRMED_SQL = `(json_type(u.raw_json,'$.SelfDestruction')='true' OR (
  json_type(u.raw_json,'$.SelfDestruction') IS NULL AND
  json_type(u.raw_json,'$.TotalSelfDamageDealt') IN ('integer','real') AND
  json_extract(u.raw_json,'$.TotalSelfDamageDealt')=-1 AND COALESCE(u.death_time,0)<=0))`;

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
  const members = new Map();
  for (const r of rows) {
    let m = members.get(r.member_id);
    if (!m) { m = { samples: 0, total: 0, ranked: 0, compatible: 0, excluded: 0, cases: [], unknown: [] }; members.set(r.member_id, m); }
    const reason = r.missing_detail ? 'missing_detail' : r.invalid ? 'invalid_flag' : r.missing_lifecycle ? 'missing_lifecycle' : r.missing_deaths ? 'missing_death_records' : null;
    const entry = { match_id: r.match_id, end_time: r.end_time, map_name: mapName(r.map_id), count: r.confirmed, compatible: r.compatible, coverage: reason ? 'partial' : 'audited' };
    m.total += r.confirmed; m.compatible += r.compatible;
    if (r.confirmed) m.cases.push(entry);
    if (reason) { m.excluded++; m.unknown.push({ ...entry, reason }); }
    else { m.samples++; m.ranked += r.confirmed; }
  }
  return { version: SELF_DESTRUCTION_VERSION, members };
}
