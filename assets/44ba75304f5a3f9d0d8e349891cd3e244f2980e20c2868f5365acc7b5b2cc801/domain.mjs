export const TITLE = '断剑蘸饭审判法庭';
export const MIN_FRIENDS = 3;
// BATrace base directory; live IDs 25/27/28 corrected from Aqualung on 2026-10-16.
// https://ba.aqualung.dev/data/maps/index.json
export const MAPS = Object.freeze({
  '1': 'Test_map', '2': 'Demo_visual', '3': 'Baltiisk', '4': 'Coast',
  '5': 'Airport', '6': 'River', '7': 'Dam', '8': 'Tallinn Harbour',
  '9': 'Airbase', '10': 'Frontiers', '11': 'Central Village', '12': 'Oil refinery',
  '13': 'Suwalki', '14': 'Jelgava', '15': 'Narva', '16': 'Klaipeda', '17': 'Ruda',
  '20': 'Parnu', '21': 'Chernyakhovsk', '22': 'Ignalina Powerplant',
  '23': 'Kaliningrad', '24': 'Kadaga', '25': 'Kadaga Military Base', '26': 'Daugavpils',
  '27': 'Daugavpils', '28': 'Coal Mountain',
});

export function mapName(id) {
  return Object.hasOwn(MAPS, String(id)) ? MAPS[String(id)] : (id === null || id === undefined || id === '' ? '未知地图' : `未知地图 #${id}`);
}

export function numericId(value, label = '玩家 ID') {
  const s = String(value ?? '').trim();
  if (!/^[1-9]\d{0,19}$/.test(s)) throw new Error(`${label} 必须是有效的数字 ID`);
  return s;
}

export function finite(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function parseSearchQuery(value) {
  const q = String(value ?? '').trim();
  const steam = q.match(/^https?:\/\/steamcommunity\.com\/profiles\/(\d{17})\/?$/i);
  const player = q.match(/^https?:\/\/dash\.batrace\.top\/player\/(\d+)\/?$/i);
  return steam?.[1] ?? player?.[1] ?? q;
}

export function parseMatchReference(value) {
  const text = String(value ?? '').trim();
  if (/^[1-9]\d{0,19}$/.test(text)) return text;
  try {
    const url = new URL(text);
    const match = url.pathname.match(/^\/match\/([1-9]\d{0,19})\/?$/);
    if (['http:', 'https:'].includes(url.protocol) && (url.hostname === 'batrace.top' || url.hostname.endsWith('.batrace.top')) && match) return match[1];
  } catch {}
  throw new Error('请输入数字对局 ID 或 BATrace 单场对局链接');
}

export function normalizeMatch(id, raw) {
  numericId(id, '对局 ID');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('无效的对局对象');
  const data = raw.Data ?? raw.data ?? raw.players ?? raw.participants;
  if (!data || typeof data !== 'object') throw new Error('对局缺少玩家数据');
  const isBa = !!raw.Data && ('EndTime' in raw || 'TotalPlayTimeInSec' in raw);
  let endTime = finite(raw.EndTime ?? raw.end_time ?? raw.endTime);
  if (endTime && endTime > 1e12) endTime = Math.floor(endTime / 1000);
  const winnerTeam = finite(raw.WinnerTeam ?? raw.winner_team ?? raw.winnerTeam, isBa ? 0 : null);
  const rows = Array.isArray(data) ? data.map((p) => [p.Id ?? p.id ?? p.player_id, p]) : Object.entries(data);
  const participants = rows.map(([key, p]) => {
    const sourceId = String(p.Id ?? p.id ?? p.player_id ?? key);
    // AI slots use negative IDs in real BA matches; account registration stays positive-only.
    const playerId = isBa && /^-[1-9]\d{0,18}$/.test(sourceId) ? sourceId : numericId(sourceId);
    // BAtrace serializes protobuf default scalars by omitting them, including team 0.
    const teamId = finite(p.TeamId ?? p.team_id ?? p.teamId, isBa ? 0 : null);
    const oldRating = finite(p.OldRating ?? p.old_rating ?? p.oldRating);
    const newRating = finite(p.NewRating ?? p.new_rating ?? p.newRating);
    return {
      playerId, name: String(p.Name ?? p.name ?? `#${playerId}`), teamId,
      oldRating, newRating, ratingDelta: oldRating !== null && newRating !== null ? newRating - oldRating : null,
      destruction: finite(p.DestructionScore ?? p.destruction_score, isBa ? 0 : null),
      losses: finite(p.LossesScore ?? p.losses_score, isBa ? 0 : null),
      objectives: finite(p.ObjectivesCaptured ?? p.objectives_captured, isBa ? 0 : null),
      won: teamId !== null && teamId !== 100 && winnerTeam !== null ? Number(teamId === winnerTeam) : null,
      raw: p,
    };
  });
  if (!participants.length || new Set(participants.map((p) => p.playerId)).size !== participants.length) {
    throw new Error('对局玩家列表为空或包含重复 ID');
  }
  return {
    id: String(id), endTime, duration: finite(raw.TotalPlayTimeInSec ?? raw.duration ?? raw.duration_sec),
    mapId: String(raw.MapId ?? raw.map_id ?? raw.mapId ?? ''),
    mode: raw.Type ?? raw.GameType ?? raw.MatchType ?? raw.Mode ?? raw.game_mode ?? (isBa ? 0 : null),
    winnerTeam, victoryLevel: finite(raw.VictoryLevel ?? raw.victory_level), participants, raw,
  };
}

export function extractFlight(html) {
  let flight = '';
  for (const match of html.matchAll(/self\.__next_f\.push\((\[.*?\])\)<\/script>/gs)) {
    try { const part = JSON.parse(match[1]); if (part[0] === 1 && typeof part[1] === 'string') flight += part[1]; } catch {}
  }
  const records = [];
  for (const line of flight.split('\n')) {
    const match = line.match(/^[\da-f]+:(.*)$/s);
    if (!match || !/^[\[{]/.test(match[1])) continue;
    try { records.push(JSON.parse(match[1])); } catch {}
  }
  return records;
}

export function extractProfile(html) {
  const records = extractFlight(html);
  let playerData = null;
  const matchMap = {};
  const metadata = {};
  function walk(value, depth = 0) {
    if (depth > 70 || !value || typeof value !== 'object') return;
    if (value.playerData?.info?.id) playerData = value.playerData;
    if (value.matchMap && typeof value.matchMap === 'object') Object.assign(matchMap, value.matchMap);
    for (const key of ['badges', 'ratingTrend', 'ratingHistory', 'socialInsights', 'maggotStats']) {
      if (value[key] && typeof value[key] === 'object') metadata[key] = value[key];
    }
    for (const [key, child] of Object.entries(value)) {
      if (['messages', 'dangerouslySetInnerHTML', 'playerData', 'matchMap'].includes(key)) continue;
      walk(child, depth + 1);
    }
  }
  records.forEach((r) => walk(r));
  if (!playerData) throw new Error('玩家页结构已变化或玩家不存在，未找到 playerData');
  return { playerData, matchMap, metadata };
}

export function extractMatchDetail(html) {
  let data = null;
  const metadata = {};
  function walk(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 70) return;
    if (value.Data && (value.EndTime || value.TotalPlayTimeInSec)) {
      if (!data || Object.values(value.Data).some((p) => p.UnitData)) data = value;
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (['messages', 'dangerouslySetInnerHTML'].includes(key)) continue;
      if (/^(unit\w*(?:map|names|info|data)|mapName|dbVersion|versionInfo)$/i.test(key) && child) metadata[key] = child;
      walk(child, depth + 1);
    }
  }
  extractFlight(html).forEach((r) => walk(r));
  if (!data || !Object.values(data.Data).some((p) => p.UnitData)) throw new Error('单场详情页未提供单位明细，可能已过期或页面结构变化');
  return { data, metadata };
}

export function extractImport(payload) {
  const matches = new Map();
  const profiles = [];
  function add(id, data) { if (id && data && typeof data === 'object') matches.set(String(id), data); }
  if (Array.isArray(payload)) {
    for (const item of payload) add(item.matchId ?? item.match_id ?? item.id, item.data ?? item.raw ?? item);
  } else if (payload && typeof payload === 'object') {
    if (payload.format === 'broken-arrow-court-v1') {
      for (const item of payload.matches ?? []) add(item.id, item.raw);
      profiles.push(...(payload.profiles ?? []));
    } else {
      for (const item of payload.matches ?? []) add(item.matchId ?? item.id, item.data ?? item.raw ?? item);
      for (const [id, data] of Object.entries(payload.matchMap ?? {})) add(id, data);
      if (payload.matchId) add(payload.matchId, payload.data ?? payload);
      if (payload.playerData?.info?.id) profiles.push({ player_id: String(payload.playerData.info.id), data: payload.playerData });
    }
  }
  if (!matches.size && !profiles.length) throw new Error('文件中没有可识别的对局或玩家档案');
  return { matches, profiles };
}
