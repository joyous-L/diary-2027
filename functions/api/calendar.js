// GET /api/calendar?cal=life|routine&start=YYYY-MM-DD&end=YYYY-MM-DD
// 구글 캘린더 비공개 주소는 Cloudflare 환경변수(LIFE_ICS, ROUTINE_ICS)에만 저장한다.
import { parseICS, expandEvents } from '../../lib/ics.js';

const SOURCES = { life: 'LIFE_ICS', routine: 'ROUTINE_ICS' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, max-age=120' },
  });

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const cal = url.searchParams.get('cal');
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  if (!SOURCES[cal] || !DATE_RE.test(start || '') || !DATE_RE.test(end || '')) {
    return json({ error: 'bad_request' }, 400);
  }
  const src = env[SOURCES[cal]];
  if (!src) return json({ configured: false, events: [] });

  try {
    const res = await fetch(src, { cf: { cacheTtl: 120, cacheEverything: true } });
    if (!res.ok) return json({ configured: true, error: 'fetch_failed', events: [] }, 502);
    const events = expandEvents(parseICS(await res.text()), start, end);
    return json({ configured: true, events });
  } catch (err) {
    return json({ configured: true, error: 'parse_failed', events: [] }, 500);
  }
}
