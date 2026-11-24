// 책갈피
// GET  /api/marks → 책갈피 전체 (최근 날짜 먼저)
// POST /api/marks { action: 'add'|'update', id?, book, author, text, note, date }
//                 { action: 'delete', id }
import { DB, notion, queryAll, plain, json, DATE_RE, titleProp, textProp, failJson } from '../../lib/notion.js';

const ID_RE = /^[0-9a-f]{32}$/;

const toMark = (p) => ({
  id: p.id.replace(/-/g, ''),
  book: plain(p.properties['책 제목']?.title),
  author: plain(p.properties['작가']?.rich_text),
  text: plain(p.properties['문장']?.rich_text),
  note: plain(p.properties['한마디']?.rich_text),
  date: p.properties['날짜']?.date?.start?.slice(0, 10) || '',
});

export async function onRequestGet({ env }) {
  if (!env.NOTION_TOKEN) return json({ configured: false, marks: [] });
  try {
    const pages = await queryAll(env, DB.marks, {
      sorts: [{ property: '날짜', direction: 'descending' }, { timestamp: 'created_time', direction: 'descending' }],
    });
    return json({ configured: true, marks: pages.map(toMark) });
  } catch (err) {
    return failJson(err);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.NOTION_TOKEN) return json({ error: 'not_configured' }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const id = String(b.id || '').replace(/-/g, '');

  try {
    if (b.action === 'delete') {
      if (!ID_RE.test(id)) return json({ error: 'bad_request' }, 400);
      await notion(env, 'PATCH', `/pages/${id}`, { archived: true });
      return json({ ok: true });
    }
    const book = String(b.book || '').trim().slice(0, 200);
    const text = String(b.text || '').trim().slice(0, 5000);
    if (!book || !text) return json({ error: 'bad_request' }, 400);
    const props = {
      '책 제목': titleProp(book),
      '작가': textProp(String(b.author || '').trim().slice(0, 200)),
      '문장': textProp(text),
      '한마디': textProp(String(b.note || '').trim().slice(0, 2000)),
      '날짜': DATE_RE.test(b.date || '') ? { date: { start: b.date } } : { date: null },
    };
    let page;
    if (b.action === 'add') {
      page = await notion(env, 'POST', '/pages', { parent: { database_id: DB.marks }, icon: { type: 'emoji', emoji: '🔖' }, properties: props });
    } else if (b.action === 'update' && ID_RE.test(id)) {
      page = await notion(env, 'PATCH', `/pages/${id}`, { properties: props });
    } else {
      return json({ error: 'bad_request' }, 400);
    }
    return json({ ok: true, mark: toMark(page) });
  } catch (err) {
    return failJson(err);
  }
}
