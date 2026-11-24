// 서버(Cloudflare Functions) 호출. 같은 기간은 잠깐 기억해 두고 다시 쓰기.
const cache = new Map();

export async function getEvents(cal, start, end) {
  const key = `${cal}|${start}|${end}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 120000) return hit.data;
  try {
    const res = await fetch(`/api/calendar?cal=${cal}&start=${start}&end=${end}`, { credentials: 'same-origin' });
    const data = res.ok ? await res.json() : { configured: true, error: `http_${res.status}`, events: [] };
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    return { configured: true, error: 'offline', events: [] };
  }
}

export function groupByDate(events) {
  const map = {};
  for (const e of events) (map[e.date] ||= []).push(e);
  return map;
}
