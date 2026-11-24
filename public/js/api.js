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

export async function getWeek(start) {
  try {
    const res = await fetch(`/api/week?start=${start}`, { credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    return res.ok ? data : { configured: true, error: data.error || `http_${res.status}`, diary: {}, habits: [], checks: {} };
  } catch {
    return { configured: true, error: 'offline', diary: {}, habits: [], checks: {} };
  }
}

async function post(path, body) {
  try {
    const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, ...data } : { ok: false, error: data.error || `http_${res.status}` };
  } catch {
    return { ok: false, error: 'offline' };
  }
}

export const saveDiary = (date, thanks, text) => post('/api/diary', { date, thanks, text });
export const setHabit = (habitId, name, date, on) => post('/api/habit', { habitId, name, date, on });

export async function getHabits(month) {
  try {
    const res = await fetch(`/api/habits?month=${month}`, { credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    return res.ok ? data : { configured: true, error: data.error || `http_${res.status}`, habits: [], checks: {} };
  } catch {
    return { configured: true, error: 'offline', habits: [], checks: {} };
  }
}
export const habitAction = (body) => post('/api/habits', body);
