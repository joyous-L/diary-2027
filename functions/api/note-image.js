// 노트 사진을 노션에 바로 올리기 (노션 파일 업로드 API)
// POST /api/note-image  (multipart: id = 노트 페이지 id, file = 사진)  → { ok, image: { id, url } }
// POST /api/note-image  (JSON: { action: 'delete', blockId })           → 사진 블록 지우기
import { notion, json, NOTION_VERSION, NotionError, failJson } from '../../lib/notion.js';

const ID_RE = /^[0-9a-f]{32}$/;
const MAX = 5 * 1024 * 1024; // 노션 무료 워크스페이스 한도에 맞춤 (앱에서 미리 줄여서 보냄)

export async function onRequestPost({ request, env }) {
  if (!env.NOTION_TOKEN) return json({ error: 'not_configured' }, 503);
  const type = request.headers.get('content-type') || '';
  try {
    if (type.includes('application/json')) {
      const b = await request.json().catch(() => ({}));
      const blockId = String(b.blockId || '').replace(/-/g, '');
      if (b.action !== 'delete' || !ID_RE.test(blockId)) return json({ error: 'bad_request' }, 400);
      await notion(env, 'DELETE', `/blocks/${blockId}`);
      return json({ ok: true });
    }

    const form = await request.formData();
    const pageId = String(form.get('id') || '').replace(/-/g, '');
    const file = form.get('file');
    if (!ID_RE.test(pageId) || !file || typeof file === 'string') return json({ error: 'bad_request' }, 400);
    if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) return json({ error: 'bad_type' }, 400);
    if (file.size > MAX) return json({ error: 'too_big' }, 400);

    // 1) 업로드 자리 만들기
    const up = await notion(env, 'POST', '/file_uploads', { filename: file.name || 'photo.jpg', content_type: file.type });
    // 2) 파일 보내기 (multipart)
    const fd = new FormData();
    fd.append('file', file, file.name || 'photo.jpg');
    const sent = await fetch(`https://api.notion.com/v1/file_uploads/${up.id}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION },
      body: fd,
    });
    if (!sent.ok) throw new NotionError(sent.status, await sent.json().catch(() => ({})));
    // 3) 노트 본문에 사진 블록으로 붙이기
    const res = await notion(env, 'PATCH', `/blocks/${pageId}/children`, {
      children: [{ object: 'block', type: 'image', image: { type: 'file_upload', file_upload: { id: up.id } } }],
    });
    const blk = res.results?.[res.results.length - 1];
    return json({ ok: true, image: { id: blk?.id?.replace(/-/g, '') || '', url: blk?.image?.file?.url || '' } });
  } catch (err) {
    if (err instanceof NotionError && err.status === 400) return json({ error: 'upload_failed', detail: err.body?.message || '' }, 400);
    return failJson(err);
  }
}
