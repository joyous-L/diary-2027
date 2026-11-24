// 노트
// GET  /api/notes          → 노트 목록 (최근 날짜 먼저, 본문 없이)
// GET  /api/notes?id=…     → 노트 하나 (글 + 사진)
// POST /api/notes { action: 'save', id?, title, cat, tags, date, text } → 새로 만들기 / 고치기 (사진은 그대로 둠)
//                 { action: 'delete', id }
import { DB, notion, queryAll, listBlocks, plain, json, DATE_RE, titleProp, textToBlocks, failJson } from '../../lib/notion.js';

const CATS = ['경제', '아이디어', '메모'];
const ID_RE = /^[0-9a-f]{32}$/;

const toNote = (p) => ({
  id: p.id.replace(/-/g, ''),
  title: plain(p.properties['제목']?.title),
  cat: p.properties['분류']?.select?.name || '',
  tags: (p.properties['태그']?.multi_select || []).map((t) => t.name),
  date: p.properties['날짜']?.date?.start?.slice(0, 10) || '',
});

const imgOf = (b) => ({ id: b.id.replace(/-/g, ''), url: b.image?.file?.url || b.image?.external?.url || '' });

export async function onRequestGet({ request, env }) {
  if (!env.NOTION_TOKEN) return json({ configured: false, notes: [] });
  const id = (new URL(request.url).searchParams.get('id') || '').replace(/-/g, '');
  try {
    if (id) {
      if (!ID_RE.test(id)) return json({ error: 'bad_request' }, 400);
      const [page, blocks] = await Promise.all([notion(env, 'GET', `/pages/${id}`), listBlocks(env, id)]);
      const text = blocks.filter((b) => b.type !== 'image' && b[b.type]?.rich_text).map((b) => plain(b[b.type].rich_text)).join('\n').replace(/\n+$/, '');
      const images = blocks.filter((b) => b.type === 'image').map(imgOf);
      return json({ configured: true, note: { ...toNote(page), text, images } });
    }
    const pages = await queryAll(env, DB.notes, {
      sorts: [{ property: '날짜', direction: 'descending' }, { timestamp: 'created_time', direction: 'descending' }],
    });
    return json({ configured: true, notes: pages.map(toNote) });
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
    if (b.action !== 'save') return json({ error: 'bad_request' }, 400);
    const props = {
      '제목': titleProp(String(b.title || '').trim().slice(0, 300) || '제목 없음'),
      '분류': CATS.includes(b.cat) ? { select: { name: b.cat } } : { select: null },
      '태그': { multi_select: [...new Set((b.tags || []).map((t) => String(t).trim().replace(/,/g, '').slice(0, 30)).filter(Boolean))].slice(0, 10).map((name) => ({ name })) },
      '날짜': DATE_RE.test(b.date || '') ? { date: { start: b.date } } : { date: null },
    };
    const text = String(b.text ?? '').slice(0, 100000);
    let page;
    if (id) {
      if (!ID_RE.test(id)) return json({ error: 'bad_request' }, 400);
      page = await notion(env, 'PATCH', `/pages/${id}`, { properties: props });
      if (b.text !== undefined) {
        // 사진 블록은 남기고 글 블록만 바꾸기
        const blocks = await listBlocks(env, id);
        for (const blk of blocks) if (blk.type !== 'image') await notion(env, 'DELETE', `/blocks/${blk.id}`);
        const nb = textToBlocks(text);
        for (let i = 0; i < nb.length; i += 100) await notion(env, 'PATCH', `/blocks/${id}/children`, { children: nb.slice(i, i + 100) });
      }
    } else {
      const nb = textToBlocks(text);
      page = await notion(env, 'POST', '/pages', {
        parent: { database_id: DB.notes }, icon: { type: 'emoji', emoji: '🗒️' }, properties: props, children: nb.slice(0, 100),
      });
      for (let i = 100; i < nb.length; i += 100) await notion(env, 'PATCH', `/blocks/${page.id}/children`, { children: nb.slice(i, i + 100) });
    }
    return json({ ok: true, note: toNote(page) });
  } catch (err) {
    return failJson(err);
  }
}
