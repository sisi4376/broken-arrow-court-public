import { dashboard, listMatches, unitStats, memberStats, supplyAnalysis } from './queries.mjs';
import { overallAnalysis, friendAnalysis, deckModel, identifyDeck, specName } from './analysis.mjs';
import { zhanfanAnalysis } from './zhanfan.mjs';

export function createReader(base, { fetcher = fetch, sqlite = window.initSqlJs } = {}) {
  let snapshot = null;
  let store = null;
  let database = null;
  let loading = null;
  let sqlLoading = null;
  const details = new Map();
  const read = async (relative, options = {}) => {
    const url = new URL(relative, base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) throw new Error('无效的快照路径');
    const response = await fetcher(url, options);
    if (!response.ok) throw new Error('数据文件不可用，请刷新加载最新版本');
    return response;
  };
  async function load() {
    const next = await (await read('manifest.json', { cache: 'no-store' })).json();
    if (next.format !== 'court-readonly-v1' || !/^[a-f0-9]{64}$/.test(next.revision)) throw new Error('无法识别的数据快照');
    if (snapshot?.revision === next.revision) return;
    const SQL = await (sqlLoading ??= sqlite({ locateFile: file => new URL(file, import.meta.url).href }));
    const response = await read(next.database);
    const bytes = new Uint8Array(await (next.database_encoding === 'gzip' ? new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : response.arrayBuffer()));
    const nextDb = new SQL.Database(bytes);
    nextDb.run('PRAGMA query_only=ON');
    const nextStore = {
      all(sql, ...args) {
        const statement = nextDb.prepare(sql);
        try { statement.bind(args); const rows = []; while (statement.step()) rows.push(statement.getAsObject()); return rows; }
        finally { statement.free(); }
      },
      get(sql, ...args) { return this.all(sql, ...args)[0]; },
    };
    database?.close(); database = nextDb; store = nextStore; snapshot = next; details.clear();
  }
  async function ready() {
    if (!snapshot) { loading ??= load().finally(() => { loading = null; }); await loading; }
  }
  return {
    get metadata() { return snapshot; },
    async refresh() { await ready(); await load(); return snapshot; },
    async hasUpdate() {
      await ready(); const next = await (await read('manifest.json', { cache: 'no-store' })).json();
      return next.revision !== snapshot.revision;
    },
    async request(route, { method = 'GET' } = {}) {
      if (method !== 'GET') throw new Error('公开版本不提供写入操作');
      await ready();
      const url = new URL(route, 'https://court.invalid');
      const path = url.pathname;
      if (path === '/api/session') return { user: { name: '公开只读', role: 'viewer', member_id: 0 }, setup_required: false, ui: { court_mode: snapshot.ui?.court_mode === true } };
      if (path === '/api/members') return { members: snapshot.members };
      if (path === '/api/maps') return { maps: snapshot.maps, modes: snapshot.modes };
      if (path === '/api/sync/status') return { active: null, settings: { sync_enabled: false, court_mode: snapshot.ui?.court_mode === true }, snapshot };
      if (path === '/api/dashboard') return dashboard(store, url.searchParams);
      if (path === '/api/matches') return listMatches(store, url.searchParams);
      if (path === '/api/analytics/members') return { members: memberStats(store, url.searchParams) };
      if (path === '/api/analytics/supply') return supplyAnalysis(store, url.searchParams);
      if (path === '/api/analytics/zhanfan') return zhanfanAnalysis(store, url.searchParams);
      if (path === '/api/analytics/units') return { units: unitStats(store, url.searchParams) };
      if (path === '/api/analytics/overview') return overallAnalysis(store,url.searchParams);
      const friend=path.match(/^\/api\/members\/(\d+)\/analysis$/);
      if(friend){const data=friendAnalysis(store,Number(friend[1]),url.searchParams);if(!data)throw new Error('朋友不存在');return data;}
      const match = path.match(/^\/api\/matches\/([1-9]\d*)$/);
      if (match) {
        const asset = store.get('SELECT asset FROM match_assets WHERE id=?', match[1]);
        if (!asset) throw new Error('该对局不在公开开黑档案中');
        if (!details.has(match[1])) {
          const detail=await (await read(asset.asset)).json(),model=deckModel(store);
          const overrides=new Map(store.all('SELECT * FROM match_decks WHERE match_id=?',detail.id).map(r=>[r.player_id,r]));
          detail.specializations=model.specializations.map(s=>({...s,display_name:specName(s)}));
          detail.participants=detail.participants.map(p=>({...p,deck:identifyDeck(p.raw,overrides.get(p.player_id),model)}));
          details.set(match[1],detail);
        }
        return details.get(match[1]);
      }
      throw new Error('公开版本不提供此功能');
    },
  };
}
