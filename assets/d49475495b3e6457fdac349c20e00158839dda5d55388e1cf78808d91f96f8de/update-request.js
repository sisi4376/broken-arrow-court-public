import { ntfyConfig, ntfyMessages, ntfyPublish } from './ntfy-transport.js';
let timer, countdown, busy = false;
const sessionStates = new Map();
export function mountUpdateRequest(toast) {
  const metadata = window.COURT_READONLY_API?.metadata;
  const ntfy = ntfyConfig(metadata?.update_ntfy);
  const url = ntfy?.url || metadata?.update_relay_url;
  const host = document.querySelector('.topbar');
  if (!url || !host || !window.COURT_READONLY) return;
  const key = 'court-update:' + url + (ntfy ? '/' + ntfy.topic : '');
  const load = () => { try { return JSON.parse(localStorage.getItem(key)) || sessionStates.get(key); } catch { return sessionStates.get(key); } };
  const save = value => { sessionStates.set(key, value); try { value ? localStorage.setItem(key, JSON.stringify(value)) : localStorage.removeItem(key); } catch { /* Keep the in-memory receipt. */ } };
  let state = load();
  const cooldownKey = key + ':next-allowed';
  let nextAllowedAt = Number(sessionStates.get(cooldownKey)) || 0;
  try { nextAllowedAt = Number(localStorage.getItem(cooldownKey)) || nextAllowedAt; } catch {}
  const rememberCooldown = value => {
    if (!Number.isFinite(value) || value <= nextAllowedAt) return;
    nextAllowedAt = value; sessionStates.set(cooldownKey, value);
    try { localStorage.setItem(cooldownKey, String(value)); } catch {}
  };
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'button'; button.id = 'request-public-update';
  button.title = ntfy ? '请求同步一次；电脑离线时云端默认缓存 12 小时' : '请求管理员电脑同步一次新对局；离线时排队等待';
  const panel = document.createElement('div'); panel.className = 'public-update-panel';
  const hint = document.createElement('span'); hint.textContent = ntfy ? '全站每 10 分钟最多更新一次；离线请求默认保留 12 小时' : '全站每 10 分钟最多更新一次；管理员电脑离线时排队等待';
  panel.append(button, hint); host.after(panel);
  const render = () => {
    const minutes = Math.max(0, Math.ceil((nextAllowedAt - Date.now()) / 60000));
    button.disabled = busy || state?.status === 'queued' || minutes > 0;
    button.textContent = state?.status === 'queued' ? '已请求，等待更新' : minutes > 0 ? `${minutes} 分钟后可请求` : '请求更新';
  };
  const call = async (route, body) => {
    if (ntfy) {
      if (body) {
        await ntfyPublish(ntfy, { format: 'court-update-request-v1', id: body.id });
        return { id: body.id, status: 'queued', sent_at: state.sent_at };
      }
      const messages = await ntfyMessages(ntfy);
      const result = messages.find(m => m.format === 'court-update-result-v1' && m.id === state.id && ['complete','failed','cooldown'].includes(m.status));
      if (result) return result;
      if (Date.now() - state.sent_at > 12 * 3600000) return { status: 'unconfirmed' };
      return state;
    }
    const response = await fetch(url + route, { method: body ? 'POST' : 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000), ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) { const error = new Error(data.error || '暂时无法提交请求'); error.status = response.status; throw error; }
    return data;
  };
  async function check() {
    if (!state || document.hidden || busy) return;
    try {
      const result = await call('/requests/' + state.id);
      rememberCooldown(result.next_allowed_at);
      if (['complete','failed','cooldown','unconfirmed'].includes(result.status)) {
        state = null; save(null); render();
        toast(result.status === 'complete' ? '本次同步和网页提交已完成，线上部署完成后刷新可见' : result.status === 'cooldown' ? '全站更新正在冷却，每 10 分钟最多一次，请稍后再申请' : result.status === 'unconfirmed' ? '12 小时内未确认完成，请求可能已过期，可重新申请' : '本次更新未完整完成，管理员可查看后台日志', !['complete','cooldown'].includes(result.status));
      } else { state = result; save(state); render(); }
    } catch { /* Offline/status errors do not create another request. */ }
  }
  button.addEventListener('click', async () => {
    if (busy || state?.status === 'queued' || Date.now() < nextAllowedAt) return;
    busy = true;
    state ??= { id: Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''), sent_at: Date.now() };
    save(state); render();
    try {
      state = await call('/requests', { id: state.id }); save(state);
      toast(ntfy ? '已发送到中转服务，等待管理员后台接收；离线默认保留 12 小时' : '请求已受理：后台运行时会依次同步，电脑离线时保留排队');
    } catch (error) {
      if ([400,403,429].includes(error.status)) { state = null; save(null); }
      toast(error.message || '连接失败，请稍后重试', true);
    } finally { busy = false; render(); await check(); }
  });
  clearInterval(timer); clearInterval(countdown);
  timer = setInterval(check, 15000); countdown = setInterval(render, 1000); render(); check();
}
