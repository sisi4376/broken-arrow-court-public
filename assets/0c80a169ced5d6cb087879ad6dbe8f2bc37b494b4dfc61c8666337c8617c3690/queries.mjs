import { mapName } from './domain.mjs';

// Complete protobuf detail omits zero-valued scalars; missing detail is not zero.
const DETAIL_METRICS = {
  damage: 'DamageDealt', damage_received: 'DamageReceived', friendly_fire: 'DamageFriendlyFireDealt',
  supplied_allies: 'SupplyPointsConsumedByAllies', received_allies: 'SupplyPointsConsumedFromAllies', supply_consumed: 'SupplyPointsConsumed',
  spawned_score: 'TotalSpawnedUnitScore', refunded_score: 'TotalRefundedUnitScore', kills: 'Destruction', units_lost: 'Losses',
  experience: 'TotalExp', raw_experience: 'RawExp',
};

export function minimumGames(params, key, fallback = 5) {
  const n = Number(params.get(key));
  return Number.isInteger(n) && n >= 1 && n <= 10000 ? n : fallback;
}

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
    ${Object.entries(DETAIL_METRICS).map(([name, field]) => `SUM(CASE WHEN m.detail_state='complete' THEN COALESCE(json_extract(r.raw_json,'$.${field}'),0) END) AS ${name}`).join(',\n    ')},
    MAX(m.duration) AS duration
    FROM registered_participants r JOIN matches m ON m.id=r.match_id WHERE ${f.sql} GROUP BY r.member_id,r.match_id)
    SELECT member_id,name,COUNT(*) AS matches,SUM(won=1) AS wins,SUM(won=0) AS losses_count,COUNT(won) AS decided,
    SUM(destruction) AS destruction,SUM(losses) AS losses,SUM(rating_delta) AS rating_delta,SUM(objectives) AS objectives,
    AVG(destruction) AS avg_destruction,COUNT(destruction) AS destruction_matches,
    AVG(losses) AS avg_losses,COUNT(losses) AS losses_matches,
    AVG(objectives) AS avg_objectives,COUNT(objectives) AS objectives_matches,
    AVG(rating_delta) AS avg_rating_delta,COUNT(rating_delta) AS rating_matches,
    COUNT(friendly_fire) AS friendly_fire_matches,COUNT(damage) AS detail_matches,COUNT(supply_consumed) AS supply_matches,
    ${Object.keys(DETAIL_METRICS).map(name => `AVG(${name}) AS avg_${name},SUM(${name}) AS ${name}`).join(',\n    ')},SUM(duration) AS duration
    FROM per_match GROUP BY member_id ORDER BY matches DESC,avg_destruction DESC`, ...f.args);
}

export function dashboard(store, params) {
  const f = filters(params);
  const comboMin = minimumGames(params, 'combo_min_games');
  const overview = store.get(`SELECT COUNT(*) AS matches,COALESCE(SUM(m.duration),0) AS duration,COALESCE(SUM(m.detail_state='complete'),0) AS complete,MIN(m.end_time) AS earliest,MAX(m.end_time) AS latest FROM matches m WHERE ${f.sql}`, ...f.args);
  const active = store.get('SELECT COUNT(*) AS count FROM members WHERE active=1').count;
  const candidates = store.get('SELECT COUNT(*) AS count FROM matches').count;
  const daily = store.all(`SELECT date(m.end_time,'unixepoch','+8 hours') AS day,COUNT(*) AS matches,SUM(m.detail_state='complete') AS complete FROM matches m WHERE ${f.sql} AND m.end_time IS NOT NULL GROUP BY day ORDER BY day`, ...f.args);
  const maps = store.all(`SELECT m.map_id,COUNT(*) AS matches,AVG(m.duration) AS duration,AVG(m.friend_count) AS friends FROM matches m WHERE ${f.sql} GROUP BY m.map_id ORDER BY matches DESC`, ...f.args).map((m) => ({ ...m, name: mapName(m.map_id) }));
  const members = memberStats(store, params);
  const combos = store.all(`WITH mt AS (SELECT DISTINCT r.match_id,r.member_id,r.member_name,r.team_id,r.won FROM registered_participants r JOIN matches m ON m.id=r.match_id WHERE ${f.sql} AND r.team_id IS NOT NULL), pairs AS (
    SELECT a.match_id,a.member_id AS a,b.member_id AS b,MIN(a.member_name) AS name_a,MIN(b.member_name) AS name_b,CASE WHEN COUNT(DISTINCT a.won)=1 THEN MIN(a.won) END AS won
    FROM mt a JOIN mt b ON a.match_id=b.match_id AND a.team_id=b.team_id AND a.member_id<b.member_id GROUP BY a.match_id,a.member_id,b.member_id)
    SELECT a,b,name_a,name_b,COUNT(*) AS matches,SUM(won=1) AS wins,COUNT(won) AS decided FROM pairs GROUP BY a,b HAVING COUNT(*)>=? ORDER BY matches DESC,a,b`, ...f.args, comboMin);
  return { overview: { ...overview, active_members: active, candidates }, daily, maps, members, combos, combo_min_games: comboMin };
}

export function supplyAnalysis(store, params = new URLSearchParams()) {
  const min = minimumGames(params, 'supply_min_games');
  const f = filters(params);
  // Classify all of a friend's units before treating an absent heavy-AA kill as zero.
  const heavyEvidence = `WITH checked_matches AS (
    SELECT r.member_id,r.match_id,SUM(CASE WHEN u.net_id IS NOT NULL AND (
      c.unit_id IS NULL OR json_extract(c.data_json,'$.role') IS NULL OR
      NOT (json_type(c.data_json,'$.role')='integer' OR (json_type(c.data_json,'$.role')='text' AND
        json_extract(c.data_json,'$.role')!='' AND json_extract(c.data_json,'$.role') NOT GLOB '*[^0-9]*')) OR
      typeof(u.kills) NOT IN ('integer','real') OR u.kills<0 OR u.kills>9007199254740991 OR CAST(u.kills AS INTEGER)!=u.kills
    ) THEN 1 ELSE 0 END) AS invalid_units
    FROM registered_participants r JOIN matches m ON m.id=r.match_id
    LEFT JOIN unit_instances u ON u.match_id=r.match_id AND u.player_id=r.player_id
    LEFT JOIN unit_catalogue c ON c.unit_id=u.unit_id
    WHERE ${f.sql} AND m.detail_state='complete' GROUP BY r.member_id,r.match_id
  ),valid_matches AS (SELECT member_id,match_id FROM checked_matches WHERE invalid_units=0)`;
  const heavySamples = new Map(store.all(`${heavyEvidence}
    SELECT member_id,COUNT(*) AS matches FROM valid_matches GROUP BY member_id`,...f.args).map(r=>[r.member_id,r.matches]));
  // KilledCount is credited to the owning player, not the type of victim.
  const heavyUnits = store.all(`${heavyEvidence}
    SELECT r.member_id,u.unit_id,COUNT(*) AS deployments,SUM(u.kills) AS kills,
    COALESCE(json_extract(c.data_json,'$.hudName'),json_extract(c.data_json,'$.name'),u.unit_id) AS name
    FROM unit_instances u JOIN registered_participants r ON r.match_id=u.match_id AND r.player_id=u.player_id
    JOIN valid_matches v ON v.member_id=r.member_id AND v.match_id=r.match_id
    JOIN unit_catalogue c ON c.unit_id=u.unit_id
    WHERE CAST(json_extract(c.data_json,'$.role') AS INTEGER)=15
    GROUP BY r.member_id,u.unit_id ORDER BY r.member_id,kills DESC,deployments DESC,u.unit_id`,...f.args);
  const byMember = new Map();
  for(const unit of heavyUnits){const list=byMember.get(unit.member_id)??[];list.push(unit);byMember.set(unit.member_id,list);}
  const members = memberStats(store, params).map(m=>{
    const units=byMember.get(m.member_id)??[];
    const samples=heavySamples.get(m.member_id)??0;
    const total=samples?units.reduce((sum,u)=>sum+u.kills,0):null;
    return {...m,unit_kd:m.units_lost>0?m.kills/m.units_lost:m.kills>0?'Infinity':null,win_rate:m.decided?m.wins/m.decided:null,
      heavy_aa_kills:total,avg_heavy_aa_kills:samples?total/samples:null,heavy_aa_kill_matches:samples,
      heavy_aa_kill_excluded:m.detail_matches-samples,heavy_aa_units:units};
  });
  const eligible = members.filter(m => m.supply_matches >= min);
  function ranking(key,samples,direction) {
    let last = null, place = 0;
    return members.filter(m=>m[samples]>=min&&m[key]!==null&&m[key]!==undefined).sort((a,b) => (direction==='asc'?Number(a[key])-Number(b[key]):Number(b[key])-Number(a[key])) || b[samples]-a[samples] || a.member_id-b.member_id).map((row,i) => {
      if (last === null || row[key] !== last) place = i+1;
      last = row[key];
      return { ...row, rank: place, sample_count:row[samples] };
    });
  }
  const definitions=[
    {id:'hungry',title:'小馋猫罪',subtitle:'补给车一响，饭点准时到。',key:'avg_received_allies',label:'场均消耗队友补给',samples:'supply_matches',sample_label:'补给详情',direction:'desc',format:'number',icon:'utensils'},
    {id:'transport',title:'运输大队长',subtitle:'补给送到位，减刑有机会。',key:'avg_supplied_allies',label:'场均补给队友',samples:'supply_matches',sample_label:'补给详情',direction:'desc',format:'number',icon:'truck'},
    {id:'kd',title:'KD失职罪',subtitle:'出门气势如虹，交换略显沉重。',key:'unit_kd',label:'单位 K/D',samples:'detail_matches',sample_label:'完整详情',direction:'asc',format:'ratio',icon:'arrow-right-left'},
    {id:'kills',title:'击杀摸鱼罪',subtitle:'枪声很热闹，战果很安静。',key:'avg_destruction',label:'场均击杀分',samples:'destruction_matches',sample_label:'击杀分记录',direction:'asc',format:'number',icon:'crosshair'},
    {id:'losses',title:'白给浪费罪',subtitle:'装备刚出厂，对面就到账。',key:'avg_losses',label:'场均损失分',samples:'losses_matches',sample_label:'损失分记录',direction:'desc',format:'number',icon:'flame'},
    {id:'wins',title:'胜率拖堂罪',subtitle:'再赢一把就散庭。',key:'win_rate',label:'开黑胜率',samples:'decided',sample_label:'已知胜负',direction:'asc',format:'percent',icon:'flag'},
    {id:'objectives',title:'占点旷工罪',subtitle:'地图那么大，偏偏绕着点走。',key:'avg_objectives',label:'场均占点',samples:'objectives_matches',sample_label:'占点记录',direction:'asc',format:'number',icon:'flag'},
    {id:'heavy_aa_kills',title:'重防赎罪榜',subtitle:'导弹打出战果，本庭酌情减刑。',key:'avg_heavy_aa_kills',label:'场均重防击杀数',samples:'heavy_aa_kill_matches',sample_label:'有效单位详情',direction:'desc',format:'decimal2',icon:'shield'},
  ];
  const charges=definitions.map(d=>({...d,group:['transport','heavy_aa_kills'].includes(d.id)?'mitigation':'sentencing',rows:ranking(d.key,d.samples,d.direction)}));
  return { min_games:min,members,eligible:eligible.length,hungry:charges[0].rows,transport:charges[1].rows,charges };
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
