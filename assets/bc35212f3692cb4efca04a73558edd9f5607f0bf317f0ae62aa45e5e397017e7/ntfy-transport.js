export function ntfyConfig(value) {
  if (!value?.topic) return null;
  const url = new URL(value.url || 'https://ntfy.sh');
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || !/^court-updates-[a-f0-9]{32}$/.test(value.topic)) throw new Error('消息中转配置无效');
  return { url: url.origin, topic: value.topic };
}
export async function ntfyMessages(config, fetcher = fetch) {
  const response = await fetcher(`${config.url}/${config.topic}/json?poll=1&since=all`, { credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`消息中转暂不可用（${response.status}）`);
  const raw = await response.text();
  if (raw.length > 1048576) throw new Error('消息数量过多，请稍后重试');
  return raw.split('\n').filter(Boolean).flatMap(line => {
    try {
      const event = JSON.parse(line);
      if (event.event !== 'message') return [];
      const payload = JSON.parse(event.message);
      if (!/^[a-f0-9]{32}$/.test(payload.id)) return [];
      return [{ ...payload, delivered_at: event.time }];
    } catch { return []; }
  });
}
export async function ntfyPublish(config, payload, fetcher = fetch) {
  const response = await fetcher(`${config.url}/${config.topic}`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload), credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) { const error = new Error(response.status === 429 ? '请求较多，请稍后重试' : `消息发送失败（${response.status}）`); error.status = response.status; throw error; }
  const event = await response.json();
  if (event.event !== 'message' || !event.id) throw new Error('未收到中转服务确认，请稍后重试');
  return event;
}
