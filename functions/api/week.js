// GET /api/week?start=YYYY-MM-DD (월요일) → 그 주의 일기·감사, 켜 둔 습관, 습관 체크
import { DB, queryAll, readPageText, plain, json, DATE_RE, addDays, NotionError } from '../../lib/notion.js';

export async function onRequestGet({ request, env }) {
  const start = new URL(request.url).searchParams.get('start');
  if (!DATE_RE.test(start || '')) return json({ error: 'bad_request' }, 400);
  if (!env.NOTION_TOKEN) return json({ configured: false, diary: {}, habits: [], checks: {} });
  const end = addDays(start, 6);

  try {
    const [diaryPages, habitPages, logPages] = await Promise.all([
      queryAll(env, DB.diary, {
        filter: { and: [{ property: '날짜', date: { on_or_after: start } }, { property: '날짜', date: { on_or_before: end } }] },
      }),
      queryAll(env, DB.habits, {
        filter: { property: '사용', checkbox: { equals: true } },
        sorts: [{ property: '순서', direction: 'ascending' }],
      }),
      queryAll(env, DB.habitLog, {
        filter: { and: [{ property: '날짜', date: { on_or_after: start } }, { property: '날짜', date: { on_or_before: end } }] },
      }),
    ]);

    const diary = {};
    await Promise.all(diaryPages.map(async (p) => {
      const date = p.properties['날짜']?.date?.start?.slice(0, 10);
      if (!date || diary[date]) return;
      diary[date] = { id: p.id, thanks: plain(p.properties['감사']?.rich_text), text: await readPageText(env, p.id) };
    }));

    const habits = habitPages.map((p) => ({
      id: p.id,
      name: plain(p.properties['이름']?.title),
      cat: p.properties['분류']?.select?.name || '',
      days: [...new Set((p.properties['요일']?.multi_select || []).map((o) => '월화수목금토일'.indexOf(o.name)).filter((i) => i >= 0))].sort((a, b) => a - b),
    }));

    const checks = {};
    for (const p of logPages) {
      const date = p.properties['날짜']?.date?.start?.slice(0, 10);
      for (const rel of p.properties['습관']?.relation || []) {
        (checks[rel.id.replace(/-/g, '')] ||= {})[date] = p.id;
      }
    }
    // 습관 id도 하이픈 없는 형태로 맞추기
    for (const h of habits) h.id = h.id.replace(/-/g, '');

    return json({ configured: true, diary, habits, checks });
  } catch (err) {
    const status = err instanceof NotionError ? err.status : 500;
    return json({ configured: true, error: status === 404 ? 'notion_not_shared' : `notion_${status}` }, 502);
  }
}
