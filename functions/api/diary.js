// POST /api/diary { date, thanks, text } → 하루 - 일기에 저장 (없으면 새로, 있으면 고치기)
import { DB, notion, queryAll, replacePageText, json, DATE_RE, NotionError } from '../../lib/notion.js';

export async function onRequestPost({ request, env }) {
  if (!env.NOTION_TOKEN) return json({ error: 'not_configured' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const { date } = body;
  const thanks = String(body.thanks ?? '').slice(0, 1900);
  const text = String(body.text ?? '').slice(0, 50000);
  if (!DATE_RE.test(date || '')) return json({ error: 'bad_request' }, 400);

  try {
    const found = await queryAll(env, DB.diary, { filter: { property: '날짜', date: { equals: date } } });
    const props = {
      '이름': { title: [{ type: 'text', text: { content: date } }] },
      '날짜': { date: { start: date } },
      '감사': { rich_text: thanks ? [{ type: 'text', text: { content: thanks } }] : [] },
    };
    let pageId;
    if (found.length) {
      pageId = found[0].id;
      await notion(env, 'PATCH', `/pages/${pageId}`, { properties: props });
    } else {
      const page = await notion(env, 'POST', '/pages', { parent: { database_id: DB.diary }, properties: props });
      pageId = page.id;
    }
    await replacePageText(env, pageId, text);
    return json({ ok: true, id: pageId });
  } catch (err) {
    const status = err instanceof NotionError ? err.status : 500;
    return json({ error: status === 404 ? 'notion_not_shared' : `notion_${status}` }, 502);
  }
}
