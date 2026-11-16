import { requestKey } from './request-key.mjs';

export function createReader(base, { fetcher = fetch, sqlite, cacheStorage = globalThis.caches } = {}) {
  let current = null, loading = null, sqlLoading = null;
  const pending = new Map();
  const prefix = 'court-v2:' + base.href + ':';
  const urlFor = relative => {
    const url = new URL(relative, base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) throw new Error('无效的快照路径');
    return url;
  };
  async function read(relative, revision) {
    const url = urlFor(relative);
    let cache;
    if (revision && cacheStorage) {
      try {
        cache = await cacheStorage.open(prefix + revision);
        const hit = await cache.match(url.href);
        if (hit) return hit;
      } catch { /* Storage may be disabled or full; network access still works. */ }
    }
    const response = await fetcher(url, revision ? {} : { cache: 'no-store' });
    if (!response.ok) throw new Error('数据文件不可用，请刷新加载最新版本');
    if (cache) try { await cache.put(url.href, response.clone()); } catch {}
    return response;
  }
  async function load() {
    const manifest = await (await read('manifest.json')).json();
    if (manifest.format !== 'court-readonly-v1' || !/^[a-f0-9]{64}$/.test(manifest.revision)) throw new Error('无法识别的数据快照');
    if (current?.manifest.revision === manifest.revision) return;
    const old = current;
    current = { manifest, store: null, db: null, loading: null, users: 0, retired: false };
    if (old) { old.retired = true; dispose(old); }
    if (cacheStorage) try {
      const names = (await cacheStorage.keys()).filter(n => n.startsWith(prefix));
      const keep = new Set([prefix + manifest.revision, ...(old ? [prefix + old.manifest.revision] : names.slice(-1))]);
      await Promise.all(names.filter(n => !keep.has(n)).map(n => cacheStorage.delete(n)));
    } catch {}
  }
  function dispose(state) { if (state.retired && !state.users && state.db) { state.db.close(); state.db = null; state.store = null; } }
  async function ready() {
    if (!current) { loading ??= load().finally(() => { loading = null; }); await loading; }
    return current;
  }
  async function sql() {
    if (!sqlLoading) sqlLoading = (async () => {
      let factory = sqlite ?? globalThis.initSqlJs;
      if (!factory) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = new URL('./sql-wasm.js', import.meta.url).href;
          script.onload = resolve;
          script.onerror = () => { script.remove(); reject(new Error('分析组件加载失败，请重试')); };
          document.head.append(script);
        });
        factory = globalThis.initSqlJs;
      }
      return factory({ locateFile: file => new URL(file, import.meta.url).href });
    })().catch(error => { sqlLoading = null; throw error; });
    return sqlLoading;
  }
  async function database(state) {
    if (!state.loading) state.loading = (async () => {
      const [SQL, response] = await Promise.all([sql(), read(state.manifest.database, state.manifest.revision)]);
      const bytes = new Uint8Array(await (state.manifest.database_encoding === 'gzip' ?
        new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : response.arrayBuffer()));
      const db = new SQL.Database(bytes);
      db.run('PRAGMA query_only=ON');
      state.db = db;
      state.store = {
        all(query, ...args) {
          const statement = db.prepare(query);
          try { statement.bind(args); const rows = []; while (statement.step()) rows.push(statement.getAsObject()); return rows; }
          finally { statement.free(); }
        },
        get(query, ...args) { return this.all(query, ...args)[0]; },
      };
      return state.store;
    })().catch(error => { state.loading = null; throw error; });
    return state.loading;
  }
  function json(asset, state) {
    const key = state.manifest.revision + ':' + asset;
    if (!pending.has(key)) pending.set(key, read(asset, state.manifest.revision).then(r => r.json()).finally(() => pending.delete(key)));
    return pending.get(key).then(value => structuredClone(value));
  }
  return {
    get metadata() { return current?.manifest ?? null; },
    async refresh() { await ready(); loading ??= load().finally(() => { loading = null; }); await loading; return current.manifest; },
    async hasUpdate() { await ready(); const next = await (await read('manifest.json')).json(); return next.revision !== current.manifest.revision; },
    async request(route, { method = 'GET' } = {}) {
      if (method !== 'GET') throw new Error('公开版本不提供写入操作');
      let state = await ready(); if (state.retired) state = current;
      const snapshot = state.manifest;
      state.users++;
      try {
        const url = new URL(route, 'https://court.invalid'), path = url.pathname;
        if (path === '/api/session') return { user: { name: '公开只读', role: 'viewer', member_id: 0 }, setup_required: false, ui: { court_mode: snapshot.ui?.court_mode === true } };
        if (path === '/api/members') return { members: structuredClone(snapshot.members) };
        if (path === '/api/maps') return { maps: snapshot.maps, modes: snapshot.modes };
        if (path === '/api/sync/status') return { active: null, settings: { sync_enabled: false, court_mode: snapshot.ui?.court_mode === true }, snapshot };
        const asset = snapshot.responses?.[requestKey(route)];
        if (asset) return await json(asset, state);
        const match = path.match(/^\/api\/matches\/([1-9]\d*)$/);
        if (match && snapshot.match_assets) {
          const file = snapshot.match_assets[match[1]];
          if (!file) throw new Error('该对局不在公开档案中');
          return await json(file, state);
        }
        const [store, api] = await Promise.all([database(state), import('./query-api.mjs')]);
        if (match) {
          const file = store.get('SELECT asset FROM match_assets WHERE id=?', match[1]);
          if (!file) throw new Error('该对局不在公开档案中');
          return api.decorateMatch(store, await json(file.asset, state));
        }
        return api.queryApi(store, route);
      } finally { state.users--; dispose(state); }
    },
  };
}
