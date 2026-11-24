// 습관 화면용
// GET  /api/habits?month=YYYY-MM → 습관 전체(켜기/끄기 포함) + 그 달의 체크
// POST /api/habits { action: 'add', name, cat }
//                  { action: 'update', id, name?, cat?, on? }
//                  { action: 'delete', id }   (노션에서 휴지통으로)
import { DB, notion, queryAll, plain, json, NotionError } from '../../lib/notion.js';

const CATS = ['자기계발', '건강관리', '생활', '마음'];
const DOW = ['월', '화', '수', '목', '금', '토', '일'];
// 요일 칸(비우면 매일) ↔ 0(월)~6(일) 숫자 목록
const readDays = (p) => [...new Set((p.properties['요일']?.multi_select || []).map((o) => DOW.indexOf(o.name)).filter((i) => i >= 0))].sort((a, b) => a - b);
const daysProp = (days) => ({ multi_select: days.map((i) => ({ name: DOW[i] })) });
const cleanDays = (v) => (Array.isArray(v) ? [...new Set(v.map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i <= 6))].sort((a, b) => a - b) : undefined);
const ID_RE = /^[0-9a-f]{32}$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

const fail = (err) => {
  const status = err instanceof NotionError ? err.status : 500;
  return json({ configured: true, error: status === 404 ? 'notion_not_shared' : `notion_${status}` }, 502);
};

function kstToday() {
  const t = new Date(Date.now() + 9 * 3600000);
  return t.toISOString().slice(0, 10);
}

const toHabit = (p) => ({
  id: p.id.replace(/-/g, ''),
  name: plain(p.properties['이름']?.title),
  cat: p.properties['분류']?.select?.name || '',
  on: !!p.properties['사용']?.checkbox,
  order: p.properties['순서']?.number ?? 0,
  start: p.properties['시작일']?.date?.start?.slice(0, 10) || '',
  days: readDays(p),
});

export async function onRequestGet({ request, env }) {
  const month = new URL(request.url).searchParams.get('month') || '';
  const mt = MONTH_RE.exec(month);
  if (!mt) return json({ error: 'bad_request' }, 400);
  if (!env.NOTION_TOKEN) return json({ configured: false, habits: [], checks: {} });
  const y = +mt[1], m = +mt[2];
  const start = `${month}-01`;
  const end = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;

  try {
    const [habitPages, logPages] = await Promise.all([
      queryAll(env, DB.habits, { sorts: [{ property: '순서', direction: 'ascending' }] }),
      queryAll(env, DB.habitLog, {
        filter: { and: [{ property: '날짜', date: { on_or_after: start } }, { property: '날짜', date: { on_or_before: end } }] },
      }),
    ]);
    const checks = {};
    for (const p of logPages) {
      const date = p.properties['날짜']?.date?.start?.slice(0, 10);
      for (const rel of p.properties['습관']?.relation || []) {
        (checks[rel.id.replace(/-/g, '')] ||= {})[date] = p.id;
      }
    }
    return json({ configured: true, habits: habitPages.map(toHabit), checks });
  } catch (err) {
    return fail(err);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.NOTION_TOKEN) return json({ error: 'not_configured' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : undefined;
  const cat = body.cat;
  let days = cleanDays(body.days);
  if (days && !days.length) days = [0, 1, 2, 3, 4, 5, 6]; // 비우면 매일 = 7일 모두 채워 저장
  if (cat !== undefined && !CATS.includes(cat)) return json({ error: 'bad_request' }, 400);

  try {
    if (body.action === 'add') {
      if (!name) return json({ error: 'bad_request' }, 400);
      const all = await queryAll(env, DB.habits, { sorts: [{ property: '순서', direction: 'descending' }] });
      const nextOrder = (all[0]?.properties['순서']?.number ?? 0) + 1;
      const page = await notion(env, 'POST', '/pages', {
        parent: { database_id: DB.habits },
        properties: {
          '이름': { title: [{ type: 'text', text: { content: name } }] },
          '분류': { select: { name: cat || '생활' } },
          '사용': { checkbox: true },
          '순서': { number: nextOrder },
          '시작일': { date: { start: kstToday() } },
          '요일': daysProp(days || [0, 1, 2, 3, 4, 5, 6]),
        },
      });
      return json({ ok: true, habit: toHabit(page) });
    }

    const id = String(body.id || '').replace(/-/g, '');
    if (!ID_RE.test(id)) return json({ error: 'bad_request' }, 400);

    if (body.action === 'update') {
      const props = {};
      if (name) props['이름'] = { title: [{ type: 'text', text: { content: name } }] };
      if (cat) props['분류'] = { select: { name: cat } };
      if (typeof body.on === 'boolean') props['사용'] = { checkbox: body.on };
      if (days) props['요일'] = daysProp(days);
      if (!Object.keys(props).length) return json({ error: 'bad_request' }, 400);
      const page = await notion(env, 'PATCH', `/pages/${id}`, { properties: props });
      return json({ ok: true, habit: toHabit(page) });
    }

    if (body.action === 'delete') {
      await notion(env, 'PATCH', `/pages/${id}`, { archived: true });
      return json({ ok: true });
    }
    return json({ error: 'bad_request' }, 400);
  } catch (err) {
    return fail(err);
  }
}
