// Normalize only equivalent defaults; arbitrary filters keep the SQL fallback.
export function requestKey(route) {
  const url = new URL(route, 'https://court.invalid');
  const p = url.searchParams;
  const friend = url.pathname.match(/^\/api\/members\/(\d+)\/analysis$/);
  for (const [key, value] of [...p]) {
    if (value === '' || (key === 'days' && value === '0') ||
        (['page', 'match_page'].includes(key) && value === '1') ||
        (['combo_min_games', 'min_games', 'court_min_games', 'supply_min_games'].includes(key) && value === '5') ||
        (key === 'match_scope' && value === 'court') ||
        (friend && key === 'member' && value === friend[1])) p.delete(key);
  }
  p.sort();
  return url.pathname + (p.size ? '?' + p : '');
}
