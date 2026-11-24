// 노션 API 도우미. 토큰은 Cloudflare 비밀 값 NOTION_TOKEN에만 둔다.
export const DB = {
  diary: '422ad774cea581cf81abecb8fbf021c1',      // 하루 - 일기
  habits: '422ad774cea581698760c348eaac2e42',     // 하루 - 습관
  habitLog: '422ad774cea581e5bdb0f59b345749bc',   // 하루 - 습관 기록
  qt: '422ad774cea581b08c02e3dcf200ea73',         // 신앙 - 큐티
};

const API = 'https://api.notion.com/v1';

export class NotionError extends Error {
  constructor(status, body) { super(`notion_${status}`); this.status = status; this.body = body; }
}

export async function notion(env, method, path, body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 400 * (attempt + 1))); continue; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new NotionError(res.status, data);
    return data;
  }
  throw new NotionError(429, {});
}

export async function queryAll(env, dbId, body) {
  const out = [];
  let cursor;
  do {
    const data = await notion(env, 'POST', `/databases/${dbId}/query`, { ...body, start_cursor: cursor, page_size: 100 });
    out.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return out;
}

export const plain = (rich = []) => rich.map((r) => r.plain_text || '').join('');

// 긴 글을 노션 문단(2000자 제한)으로 나누기
export function textToBlocks(text) {
  const blocks = [];
  for (const line of String(text || '').split('\n')) {
    const chunks = line.length ? line.match(/[\s\S]{1,1900}/g) : [''];
    for (const c of chunks) {
      blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: c ? [{ type: 'text', text: { content: c } }] : [] } });
    }
  }
  while (blocks.length && !blocks[blocks.length - 1].paragraph.rich_text.length) blocks.pop();
  return blocks;
}

export async function readPageText(env, pageId) {
  const lines = [];
  let cursor;
  do {
    const data = await notion(env, 'GET', `/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`);
    for (const b of data.results) {
      const rt = b[b.type]?.rich_text;
      if (rt) lines.push(plain(rt));
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return lines.join('\n').replace(/\n+$/, '');
}

export async function replacePageText(env, pageId, text) {
  const old = [];
  let cursor;
  do {
    const data = await notion(env, 'GET', `/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`);
    old.push(...data.results.map((b) => b.id));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  for (const id of old) await notion(env, 'DELETE', `/blocks/${id}`);
  const blocks = textToBlocks(text);
  for (let i = 0; i < blocks.length; i += 100) {
    await notion(env, 'PATCH', `/blocks/${pageId}/children`, { children: blocks.slice(i, i + 100) });
  }
}

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

// 속성 칸용 글자 (2000자 제한이라 나눠 넣기)
export function richText(text) {
  const t = String(text || '');
  if (!t) return [];
  return (t.match(/[\s\S]{1,1900}/g) || []).slice(0, 100).map((c) => ({ type: 'text', text: { content: c } }));
}

// 본문 블록을 종류와 글자로 읽기 (제목 블록 구분용)
export async function readBlocks(env, pageId) {
  const out = [];
  let cursor;
  do {
    const data = await notion(env, 'GET', `/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`);
    for (const b of data.results) {
      const rt = b[b.type]?.rich_text;
      if (rt) out.push({ type: b.type, text: plain(rt) });
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return out;
}
