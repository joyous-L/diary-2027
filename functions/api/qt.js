// 큐티
// GET  /api/qt?date=YYYY-MM-DD → 그날 큐티(말씀·해설·묵상·기도) + 그 주(월~일)에 쓴 날
// POST /api/qt { date, med, pray } → 묵상·기도 저장 (그날 카드가 없으면 새로 만듦)
//
// 본문 형식 (큐티 스킬이 올리는 방식):
//   ## 성경말씀  → 아래 문단 한 줄 = 한 절 ("1 태초에 …", 앞 숫자 = 절 번호)
//   ## 해설      → 아래 문단들 = 해설 원문
//   제목 블록이 없으면 본문 전체를 말씀으로 봄
import { DB, notion, queryAll, readBlocks, richText, plain, json, DATE_RE, addDays, NotionError } from '../../lib/notion.js';

const fail = (err) => {
  const status = err instanceof NotionError ? err.status : 500;
  return json({ configured: true, error: status === 404 ? 'notion_not_shared' : `notion_${status}` }, 502);
};

function mondayOf(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(key, -dow);
}

function parseBody(blocks) {
  const verses = [], note = [];
  let sec = blocks.some((b) => b.type.startsWith('heading')) ? null : 'word';
  for (const b of blocks) {
    if (b.type.startsWith('heading')) {
      sec = /말씀|본문/.test(b.text) ? 'word' : /해설/.test(b.text) ? 'note' : null;
      continue;
    }
    if (sec === 'word') {
      for (const line of b.text.split('\n')) {
        if (!line.trim()) continue;
        const m = /^\s*(\d{1,3})\s*[.:)]?\s+(.+)$/.exec(line);
        verses.push(m ? { n: m[1], t: m[2] } : { n: '', t: line.trim() });
      }
    } else if (sec === 'note') {
      note.push(b.text);
    }
  }
  return { verses, note: note.join('\n').replace(/^\n+|\n+$/g, '') };
}

export async function onRequestGet({ request, env }) {
  const date = new URL(request.url).searchParams.get('date');
  if (!DATE_RE.test(date || '')) return json({ error: 'bad_request' }, 400);
  if (!env.NOTION_TOKEN) return json({ configured: false, entry: null, week: {} });
  const mon = mondayOf(date);

  try {
    const pages = await queryAll(env, DB.qt, {
      filter: { and: [{ property: '날짜', date: { on_or_after: mon } }, { property: '날짜', date: { on_or_before: addDays(mon, 6) } }] },
    });
    const week = {};
    let page = null;
    for (const p of pages) {
      const d = p.properties['날짜']?.date?.start?.slice(0, 10);
      if (!d) continue;
      const written = !!(plain(p.properties['묵상']?.rich_text).trim() || plain(p.properties['기도']?.rich_text).trim());
      week[d] = week[d] === 'done' || written ? 'done' : 'word';
      if (d === date && !page) page = p;
    }
    let entry = null;
    if (page) {
      const body = parseBody(await readBlocks(env, page.id));
      entry = {
        id: page.id,
        title: plain(page.properties['제목']?.title),
        range: plain(page.properties['본문 범위']?.rich_text),
        med: plain(page.properties['묵상']?.rich_text),
        pray: plain(page.properties['기도']?.rich_text),
        ...body,
      };
    }
    return json({ configured: true, entry, week });
  } catch (err) {
    return fail(err);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.NOTION_TOKEN) return json({ error: 'not_configured' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const { date } = body;
  if (!DATE_RE.test(date || '')) return json({ error: 'bad_request' }, 400);
  const med = String(body.med ?? '').slice(0, 20000);
  const pray = String(body.pray ?? '').slice(0, 20000);

  try {
    const found = await queryAll(env, DB.qt, { filter: { property: '날짜', date: { equals: date } } });
    const props = { '묵상': { rich_text: richText(med) }, '기도': { rich_text: richText(pray) } };
    if (found.length) {
      await notion(env, 'PATCH', `/pages/${found[0].id}`, { properties: props });
    } else {
      await notion(env, 'POST', '/pages', {
        parent: { database_id: DB.qt },
        properties: {
          '제목': { title: [{ type: 'text', text: { content: date } }] },
          '날짜': { date: { start: date } },
          ...props,
        },
      });
    }
    return json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
