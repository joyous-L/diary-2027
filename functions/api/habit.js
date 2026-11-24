// POST /api/habit { habitId, name, date, on } → 하루 - 습관 기록에 체크 한 줄 추가/삭제
import { DB, notion, queryAll, json, DATE_RE, NotionError } from '../../lib/notion.js';

const ID_RE = /^[0-9a-f]{32}$/;

export async function onRequestPost({ request, env }) {
  if (!env.NOTION_TOKEN) return json({ error: 'not_configured' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const habitId = String(body.habitId || '').replace(/-/g, '');
  const { date, on } = body;
  if (!ID_RE.test(habitId) || !DATE_RE.test(date || '')) return json({ error: 'bad_request' }, 400);

  try {
    const existing = await queryAll(env, DB.habitLog, {
      filter: { and: [{ property: '날짜', date: { equals: date } }, { property: '습관', relation: { contains: habitId } }] },
    });
    if (on && !existing.length) {
      const name = String(body.name || '').slice(0, 100);
      await notion(env, 'POST', '/pages', {
        parent: { database_id: DB.habitLog },
        properties: {
          '이름': { title: [{ type: 'text', text: { content: `${name} ${date}`.trim() } }] },
          '습관': { relation: [{ id: habitId }] },
          '날짜': { date: { start: date } },
        },
      });
    } else if (!on) {
      for (const p of existing) await notion(env, 'PATCH', `/pages/${p.id}`, { archived: true });
    }
    return json({ ok: true });
  } catch (err) {
    const status = err instanceof NotionError ? err.status : 500;
    return json({ error: status === 404 ? 'notion_not_shared' : `notion_${status}` }, 502);
  }
}
