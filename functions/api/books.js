// 완독 리스트
// GET  /api/books → 다 읽은 책 전체 (독서 기간 끝 날짜 순)
// POST /api/books { action: 'add'|'update', id?, title, author, pub, genre, start, end }
//                 { action: 'delete', id }
import { DB, notion, queryAll, plain, json, DATE_RE, titleProp, textProp, failJson } from '../../lib/notion.js';

const GENRES = ['인문', '철학', '소설', '역사', '경제', '신앙', '기타'];
const ID_RE = /^[0-9a-f]{32}$/;

const toBook = (p) => {
  const d = p.properties['독서 기간']?.date;
  return {
    id: p.id.replace(/-/g, ''),
    title: plain(p.properties['책 제목']?.title),
    author: plain(p.properties['작가']?.rich_text),
    pub: plain(p.properties['출판사']?.rich_text),
    genre: p.properties['분야']?.select?.name || '',
    start: d?.start?.slice(0, 10) || '',
    end: (d?.end || d?.start || '').slice(0, 10),
  };
};

export async function onRequestGet({ env }) {
  if (!env.NOTION_TOKEN) return json({ configured: false, books: [] });
  try {
    const pages = await queryAll(env, DB.books, { sorts: [{ property: '독서 기간', direction: 'ascending' }] });
    return json({ configured: true, books: pages.map(toBook) });
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
    const title = String(b.title || '').trim().slice(0, 200);
    if (!title) return json({ error: 'bad_request' }, 400);
    if (b.genre && !GENRES.includes(b.genre)) return json({ error: 'bad_request' }, 400);
    const start = DATE_RE.test(b.start || '') ? b.start : null;
    let end = DATE_RE.test(b.end || '') ? b.end : null;
    if (start && end && end < start) return json({ error: 'bad_dates' }, 400);
    if (start && end === start) end = null;
    const props = {
      '책 제목': titleProp(title),
      '작가': textProp(String(b.author || '').trim().slice(0, 200)),
      '출판사': textProp(String(b.pub || '').trim().slice(0, 200)),
      '분야': b.genre ? { select: { name: b.genre } } : { select: null },
      '독서 기간': start || end ? { date: { start: start || end, end: start ? end : null } } : { date: null },
    };
    let page;
    if (b.action === 'add') {
      page = await notion(env, 'POST', '/pages', { parent: { database_id: DB.books }, icon: { type: 'emoji', emoji: '📕' }, properties: props });
    } else if (b.action === 'update' && ID_RE.test(id)) {
      page = await notion(env, 'PATCH', `/pages/${id}`, { properties: props });
    } else {
      return json({ error: 'bad_request' }, 400);
    }
    return json({ ok: true, book: toBook(page) });
  } catch (err) {
    return failJson(err);
  }
}
