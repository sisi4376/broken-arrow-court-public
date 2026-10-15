import { mapName } from './domain.mjs';

export function filters(params, { candidates = false } = {}) {
  const conditions = [candidates && params.get('scope') === 'all' ? '1=1' : 'm.friend_count>=3'];
  const args = [];
  const days = Number(params.get('days') ?? 0);
  if ([7,30,90,365].includes(days)) { conditions.push('m.end_time>=?'); args.push(Math.floor(Date.now() / 1000) - days * 86400); }
  for (const [key, op, suffix] of [['from','>=','00:00:00'],['to','<=','23:59:59']]) {
    const v = params.get(key);
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) { const date = Date.parse(`${v}T${suffix}+08:00`); if (Number.isFinite(date)) { conditions.push(`m.end_time${op}?`); args.push(date / 1000); } }
  }
  if (params.get('map')) { conditions.push('m.map_id=?'); args.push(params.get('map')); }
  if (params.has('mode') && params.get('mode') !== '') { conditions.push('m.mode=?'); args.push(params.get('mode')); }
  if (/^\d+$/.test(params.get('member') ?? '')) { conditions.push('EXISTS(SELECT 1 FROM registered_participants rp WHERE rp.match_id=m.id AND rp.member_id=?)'); args.push(Number(params.get('member'))); }
  if (params.get('team') === 'same') conditions.push('m.same_team_count>=3');
  if (params.get('detail') === 'complete') conditions.push("m.detail_state='complete'");
  if (params.get('detail') === 'missing') conditions.push("m.detail_state!='complete'");
  const q = params.get('q')?.trim();
  if (q) { conditions.push("(m.id LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM participants p WHERE p.match_id=m.id AND p.name LIKE ? ESCAPE '\\'))"); const s = `%${q.replace(/[\\%_]/g, '\\$&')}%`; args.push(s,s); }
  return { sql: conditions.join(' AND '), args };
}

export function memberStats(store, params = new URLSearchParams()) {
  const f = filters(params);
  return store.all(`WITH per_match AS (
    SELECT r.match_id,r.member_id,MIN(r.member_name) AS name,
    SUM(CASE WHEN json_type(m.raw_json,'$.Data')='object' THEN COALESCE(r.destruction,0) ELSE r.destruction END) AS destruction,
    SUM(CASE WHEN json_type(m.raw_json,'$.Data')='object' THEN COALESCE(r.losses,0) ELSE r.losses END) AS losses,
    SUM(r.rating_delta) AS rating_delta,SUM(r.objectives) AS objectives,
    CASE WHEN COUNT(DISTINCT r.won)=1 THEN MIN(r.won) END AS won,
    SUM(CASE WHEN m.detail_state='complete' THEN COALESCE(json_extract(r.raw_json,'$.DamageDealt'),0) END) AS damage,
    SUM(CASE WHEN m.detail_state='complete' THEN COALESCE(json_extract(r.raw_json,'$.DamageFriendlyFireDealt'),0) END) AS friendly_fire,
    SUM(CASE WHEN m.detail_state='complete' THEN COALESCE(json_extract(r.raw_json,'$.SupplyPointsConsumedByAllies'),0) END) AS supplied_allies,
    MAX(m.duration) AS duration
    FROM registered_participants r JOIN matches m ON m.id=r.match_id WHERE ${f.sql} GROUP BY r.member_id,r.match_id)
    SELECT member_id,name,COUNT(*) AS matches,SUM(won=1) AS wins,SUM(won=0) AS losses_count,COUNT(won) AS decided,
    SUM(destruction) AS destruction,SUM(losses) AS losses,SUM(rating_delta) AS rating_delta,SUM(objectives) AS objectives,
    AVG(destruction) AS avg_destruction,COUNT(destruction) AS destruction_matches,
    AVG(losses) AS avg_losses,COUNT(losses) AS losses_matches,
    AVG(objectives) AS avg_objectives,COUNT(objectives) AS objectives_matches,
    AVG(friendly_fire) AS avg_friendly_fire,COUNT(friendly_fire) AS friendly_fire_matches,
    AVG(damage) AS avg_damage,AVG(supplied_allies) AS avg_supplied_allies,
    SUM(damage) AS damage,SUM(friendly_fire) AS friendly_fire,SUM(supplied_allies) AS supplied_allies,SUM(duration) AS duration
    FROM per_match GROUP BY member_id ORDER BY matches DESC,avg_destruction DESC`, ...f.args);
}

export function dashboard(store, params) {
  const f = filters(params);
  const overview = store.get(`SELECT COUNT(*) AS matches,COALESCE(SUM(m.duration),0) AS duration,COALESCE(SUM(m.detail_state='complete'),0) AS complete,MIN(m.end_time) AS earliest,MAX(m.end_time) AS latest FROM matches m WHERE ${f.sql}`, ...f.args);
  const active = store.get('SELECT COUNT(*) AS count FROM members WHERE active=1').count;
  const candidates = store.get('SELECT COUNT(*) AS count FROM matches').count;
  const daily = store.all(`SELECT date(m.end_time,'unixepoch','+8 hours') AS day,COUNT(*) AS matches,SUM(m.detail_state='complete') AS complete FROM matches m WHERE ${f.sql} AND m.end_time IS NOT NULL GROUP BY day ORDER BY day`, ...f.args);
  const maps = store.all(`SELECT m.map_id,COUNT(*) AS matches,AVG(m.duration) AS duration,AVG(m.friend_count) AS friends FROM matches m WHERE ${f.sql} GROUP BY m.map_id ORDER BY matches DESC`, ...f.args).map((m) => ({ ...m, name: mapName(m.map_id) }));
  const members = memberStats(store, params);
  const combos = store.all(`WITH mt AS (SELECT DISTINCT r.match_id,r.member_id,r.member_name,r.team_id,r.won FROM registered_participants r JOIN matches m ON m.id=r.match_id WHERE ${f.sql} AND r.team_id IS NOT NULL), pairs AS (
    SELECT a.match_id,a.member_id AS a,b.member_id AS b,MIN(a.member_name) AS name_a,MIN(b.member_name) AS name_b,CASE WHEN COUNT(DISTINCT a.won)=1 THEN MIN(a.won) END AS won
    FROM mt a JOIN mt b ON a.match_id=b.match_id AND a.team_id=b.team_id AND a.member_id<b.member_id GROUP BY a.match_id,a.member_id,b.member_id)
    SELECT a,b,name_a,name_b,COUNT(*) AS matches,SUM(won=1) AS wins,COUNT(won) AS decided FROM pairs GROUP BY a,b ORDER BY matches DESC LIMIT 20`, ...f.args);
  return { overview: { ...overview, active_members: active, candidates }, daily, maps, members, combos };
}

export function listMatches(store, params, candidates = false) {
  const f = filters(params, { candidates });
  const page = Math.max(1, Math.min(100000, Number(params.get('page')) || 1));
  const limit = 20;
  const total = store.get(`SELECT COUNT(*) AS count FROM matches m WHERE ${f.sql}`, ...f.args).count;
  const items = store.all(`SELECT m.id,m.end_time,m.duration,m.map_id,m.mode,m.winner_team,m.victory_level,m.friend_count,m.same_team_count,m.detail_state,m.detail_error,m.updated_at FROM matches m WHERE ${f.sql} ORDER BY m.end_time DESC,CAST(m.id AS INTEGER) DESC LIMIT ? OFFSET ?`, ...f.args, limit, (page - 1) * limit);
  for (const item of items) {
    item.map_name = mapName(item.map_id);
    item.friends = store.all('SELECT DISTINCT member_id,member_name,team_id,won FROM registered_participants WHERE match_id=? ORDER BY team_id,member_id', item.id);
    item.totals = store.get(`WITH per_friend AS (
      SELECT member_id,SUM(destruction) AS destruction,SUM(losses) AS losses,SUM(rating_delta) AS rating_delta,SUM(objectives) AS objectives
      FROM registered_participants WHERE match_id=? GROUP BY member_id)
      SELECT AVG(destruction) AS avg_destruction,AVG(losses) AS avg_losses,SUM(rating_delta) AS rating_delta FROM per_friend`, item.id);
  }
  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

export function matchDetail(store, id) {
  const row = store.get('SELECT * FROM matches WHERE id=?', String(id));
  if (!row) return null;
  const participants = store.all('SELECT p.*,a.member_id,m.name AS member_name,m.active AS member_active,a.active AS account_active FROM participants p LEFT JOIN accounts a ON a.player_id=p.player_id LEFT JOIN members m ON m.id=a.member_id WHERE p.match_id=? ORDER BY p.team_id,p.destruction DESC', String(id)).map((p) => ({ ...p, raw: JSON.parse(p.raw_json), raw_json: undefined, registered: !!(p.member_id && p.member_active && p.account_active) }));
  const units = store.all('SELECT u.*,c.data_json AS catalogue_json FROM unit_instances u LEFT JOIN unit_catalogue c ON c.unit_id=u.unit_id WHERE u.match_id=? ORDER BY u.spawn_time,CAST(u.net_id AS INTEGER)', String(id)).map((u) => ({ ...u, raw: JSON.parse(u.raw_json), catalogue: u.catalogue_json ? JSON.parse(u.catalogue_json) : null, raw_json: undefined, catalogue_json: undefined }));
  return { ...row, map_name: mapName(row.map_id), raw: JSON.parse(row.raw_json), detail: row.detail_json ? JSON.parse(row.detail_json) : null, raw_json: undefined, detail_json: undefined, participants, units };
}

export function unitStats(store, params) {
  const f = filters(params);
  const extra = /^\d+$/.test(params.get('unit_member') ?? '') ? ' AND r.member_id=?' : '';
  const args = [...f.args, ...(extra ? [Number(params.get('unit_member'))] : [])];
  return store.all(`SELECT u.unit_id,COUNT(*) AS instances,COUNT(DISTINCT u.match_id) AS matches,SUM(u.kills) AS kills,SUM(u.damage) AS damage,SUM(u.damage_received) AS damage_received,SUM(u.supply) AS supply,SUM(u.refunded) AS refunded,SUM(u.death_time IS NOT NULL) AS deaths,c.data_json AS catalogue_json
    FROM unit_instances u JOIN registered_participants r ON r.match_id=u.match_id AND r.player_id=u.player_id JOIN matches m ON m.id=u.match_id LEFT JOIN unit_catalogue c ON c.unit_id=u.unit_id WHERE ${f.sql}${extra} GROUP BY u.unit_id ORDER BY damage DESC LIMIT 300`, ...args).map((u) => ({ ...u, catalogue: u.catalogue_json ? JSON.parse(u.catalogue_json) : null, catalogue_json: undefined }));
}
