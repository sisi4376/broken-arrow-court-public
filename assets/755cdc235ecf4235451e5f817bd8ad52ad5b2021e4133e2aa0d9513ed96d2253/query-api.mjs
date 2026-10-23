import { dashboard, listMatches, unitStats, memberStats, supplyAnalysis } from './queries.mjs';
import { overallAnalysis, friendAnalysis, deckModel, identifyDeck, specName } from './analysis.mjs';
import { zhanfanAnalysis } from './zhanfan.mjs';

export function queryApi(store, route) {
  const url = new URL(route, 'https://court.invalid'), p = url.searchParams;
  switch (url.pathname) {
    case '/api/dashboard': return dashboard(store, p);
    case '/api/matches': return listMatches(store, p);
    case '/api/analytics/members': return { members: memberStats(store, p) };
    case '/api/analytics/supply': return supplyAnalysis(store, p);
    case '/api/analytics/zhanfan':
      if (p.get('court_cases') === '1' || p.get('court_compare') === '1') throw new Error('案例复核和历史对照仅在本地后台提供');
      return zhanfanAnalysis(store, p);
    case '/api/analytics/units': return { units: unitStats(store, p) };
    case '/api/analytics/overview': return overallAnalysis(store, p);
  }
  const friend = url.pathname.match(/^\/api\/members\/(\d+)\/analysis$/);
  if (friend) {
    const data = friendAnalysis(store, Number(friend[1]), p);
    if (!data) throw new Error('朋友不存在');
    return data;
  }
  throw new Error('公开版本不提供此功能');
}

export function decorateMatch(store, detail) {
  const model = deckModel(store);
  const overrides = new Map(store.all('SELECT * FROM match_decks WHERE match_id=?', detail.id).map(r => [r.player_id, r]));
  detail.specializations = model.specializations.map(s => ({ ...s, display_name: specName(s) }));
  detail.participants = detail.participants.map(p => ({ ...p, deck: identifyDeck(p.raw, overrides.get(p.player_id), model) }));
  return detail;
}
