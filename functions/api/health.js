// 건강
// GET  /api/health?year=YYYY → 그 해 컨디션 기록 + 진료기록
// POST /api/health { kind: 'cond', date, level, note, tags }   → 그날 컨디션 저장(없으면 새로, 다 비우면 삭제)
//                  { kind: 'visit', action: 'add'|'update', id?, date, place, why, result }
//                  { kind: 'visit', action: 'delete', id }
import { DB, notion, queryAll, plain, json, DATE_RE, titleProp, textProp, failJson } from '../../lib/notion.js';

const LEVELS = ['아주 좋음', '좋음', '보통', '안 좋음', '아픔'];
const ID_RE = /^[0-9a-f]{32}$/;

const toCond = (p) => ({
  id: p.id.replace(/-/g, ''),
  date: p.properties['날짜']?.date?.start?.slice(0, 10) || '',
  level: p.properties['단계']?.select?.name || '',
  note: plain(p.properties['한 줄']?.rich_text),
  tags: (p.properties['증상']?.multi_select || []).map((t) => t.name),
});
const toVisit = (p) => ({
  id: p.id.replace(/-/g, ''),
  date: p.properties['날짜']?.date?.start?.slice(0, 10) || '',
  place: plain(p.properties['병원']?.title),
  why: plain(p.properties['사유']?.rich_text),
  result: plain(p.properties['경과']?.rich_text),
});

const inYear = (y) => ({ and: [{ property: '날짜', date: { on_or_after: `${y}-01-01` } }, { property: '날짜', date: { on_or_before: `${y}-12-31` } }] });

export async function onRequestGet({ request, env }) {
  const year = new URL(request.url).searchParams.get('year') || '';
  if (!/^\d{4}$/.test(year)) return json({ error: 'bad_request' }, 400);
  if (!env.NOTION_TOKEN) return json({ configured: false, conditions: [], visits: [], tags: [] });
  try {
    const [cp, vp, meta] = await Promise.all([
      queryAll(env, DB.cond, { filter: inYear(year), sorts: [{ property: '날짜', direction: 'ascending' }] }),
      queryAll(env, DB.visits, { filter: inYear(year), sorts: [{ property: '날짜', direction: 'descending' }] }),
      notion(env, 'GET', `/databases/${DB.cond}`),
    ]);
    const tags = (meta.properties?.['증상']?.multi_select?.options || []).map((o) => o.name);
    return json({ configured: true, conditions: cp.map(toCond), visits: vp.map(toVisit), tags });
  } catch (err) {
    return failJson(err);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.NOTION_TOKEN) return json({ error: 'not_configured' }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }

  try {
    if (b.kind === 'cond') {
      if (!DATE_RE.test(b.date || '')) return json({ error: 'bad_request' }, 400);
      const level = LEVELS.includes(b.level) ? b.level : null;
      const note = String(b.note || '').trim().slice(0, 5000);
      const tags = [...new Set((Array.isArray(b.tags) ? b.tags : []).map((t) => String(t).trim().replace(/,/g, '').slice(0, 30)).filter(Boolean))].slice(0, 20);
      const found = await queryAll(env, DB.cond, { filter: { property: '날짜', date: { equals: b.date } } });
      if (!level && !note && !tags.length) {
        for (const p of found) await notion(env, 'PATCH', `/pages/${p.id}`, { archived: true });
        return json({ ok: true, cond: null });
      }
      const props = {
        '단계': level ? { select: { name: level } } : { select: null },
        '한 줄': textProp(note),
        '증상': { multi_select: tags.map((name) => ({ name })) },
      };
      const page = found.length
        ? await notion(env, 'PATCH', `/pages/${found[0].id}`, { properties: props })
        : await notion(env, 'POST', '/pages', {
          parent: { database_id: DB.cond }, icon: { type: 'emoji', emoji: '🌤️' },
          properties: { '이름': titleProp(b.date), '날짜': { date: { start: b.date } }, ...props },
        });
      return json({ ok: true, cond: toCond(page) });
    }

    if (b.kind === 'visit') {
      const id = String(b.id || '').replace(/-/g, '');
      if (b.action === 'delete') {
        if (!ID_RE.test(id)) return json({ error: 'bad_request' }, 400);
        await notion(env, 'PATCH', `/pages/${id}`, { archived: true });
        return json({ ok: true });
      }
      const place = String(b.place || '').trim().slice(0, 200);
      if (!place || !DATE_RE.test(b.date || '')) return json({ error: 'bad_request' }, 400);
      const props = {
        '병원': titleProp(place),
        '날짜': { date: { start: b.date } },
        '사유': textProp(String(b.why || '').trim().slice(0, 2000)),
        '경과': textProp(String(b.result || '').trim().slice(0, 2000)),
      };
      let page;
      if (b.action === 'add') page = await notion(env, 'POST', '/pages', { parent: { database_id: DB.visits }, icon: { type: 'emoji', emoji: '🏥' }, properties: props });
      else if (b.action === 'update' && ID_RE.test(id)) page = await notion(env, 'PATCH', `/pages/${id}`, { properties: props });
      else return json({ error: 'bad_request' }, 400);
      return json({ ok: true, visit: toVisit(page) });
    }
    return json({ error: 'bad_request' }, 400);
  } catch (err) {
    return failJson(err);
  }
}
