// 노트: 왼쪽 = 목록(분류 · 경제 태그로 거르기), 오른쪽 = 펼친 노트(쓰면 자동 저장, 사진은 노션에 바로 올라감)
// iPhone: 목록 ↔ 노트 화면 (#/notes, #/notes/<id>, #/notes/new)
import { todayKey, esc } from '../util.js';
import { getNotes, getNote, noteAction, uploadNoteImage, deleteNoteImage } from '../api.js';

const PLUS = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M7 2v10M2 7h10"/></svg>';
const BACK = '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>';
const CAT_COLOR = { '경제': '#4A6A8A', '아이디어': '#A07A3A', '메모': '#8A867D' };
const CATS = Object.keys(CAT_COLOR);
const ECON_TAGS = ['주식', '차트', '뉴스', '용어'];
const ERR = { offline: '인터넷 연결을 확인해 주세요', notion_not_shared: '노션 연결을 확인해 주세요', not_configured: '노션 연결 전이에요', too_big: '사진이 너무 커요', bad_type: '이 사진 형식은 못 올려요', upload_failed: '사진을 올리지 못했어요' };
const errText = (e) => (e ? ERR[e] || '저장하지 못했어요' : '');
const md = (k) => (k ? `${Number(k.slice(5, 7))}.${Number(k.slice(8, 10))}` : '');

let filter = { cat: '전체', tag: '' };
let lastOpen = null;
let pending = null;

// 사진을 긴 변 1600px JPEG로 줄이기 (노션 5MB 한도 안으로)
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    let q = 0.85, blob;
    do { blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', q)); q -= 0.15; } while (blob && blob.size > 4.5 * 1024 * 1024 && q > 0.3);
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

async function flushSave() {
  if (!pending) return;
  const p = pending;
  clearTimeout(p.timer);
  pending = null;
  await p.run();
}

function listHtml(st) {
  const list = st.notes.filter((n) => (filter.cat === '전체' || n.cat === filter.cat) && (!filter.tag || n.tags.includes(filter.tag)));
  const chips = ['전체', ...CATS].map((c) => `<button type="button" class="ncat" data-cat="${c}" aria-pressed="${filter.cat === c}"><i style="background:${c === '전체' ? (filter.cat === c ? 'var(--paper)' : '#8A867D') : CAT_COLOR[c]}"></i>${c}</button>`).join('');
  const subs = filter.cat === '경제' ? `<div class="nsubs">${ECON_TAGS.map((t) => `<button type="button" class="nsub" data-ftag="${t}" aria-pressed="${filter.tag === t}">#${t}</button>`).join('')}</div>` : '';
  const rows = list.map((n) => `<a class="nrow${n.id === st.open?.id ? ' on' : ''}" href="#/notes/${n.id}">
      <span class="t"><i style="background:${CAT_COLOR[n.cat] || '#C4BEB1'}"></i><b>${esc(n.title || '제목 없음')}</b><small>${md(n.date)}</small></span>
      ${n.tags.length ? `<span class="tg-s" style="color:${CAT_COLOR[n.cat] || 'var(--muted)'}">${n.tags.map((t) => `#${esc(t)}`).join(' ')}</span>` : ''}</a>`).join('');
  const empty = !st.loaded ? '불러오는 중…' : !st.configured ? '노션 연결 전이에요' : st.notes.length ? '이 분류에는 노트가 없어요' : '아직 노트가 없어요. 새 노트로 시작해 보세요';
  return `<div class="ncats">${chips}</div>${subs}${st.error ? `<p class="hl-status">${esc(errText(st.error))}</p>` : ''}
    <div class="nlist">${rows || `<p class="muted hl-empty">${empty}</p>`}</div>`;
}

function editorHtml(st, single) {
  const n = st.open;
  if (!n) return `<div class="nempty muted">${st.loaded && st.notes.length ? '왼쪽에서 노트를 고르거나 새 노트를 만들어요' : '새 노트를 눌러 시작해요'}</div>`;
  if (n.loading) return '<div class="nempty muted">불러오는 중…</div>';
  const catBtns = CATS.map((c) => `<button type="button" class="ncat sm" data-ecat="${c}" aria-pressed="${n.cat === c}"${n.cat === c ? ` style="background:${CAT_COLOR[c]};color:var(--paper)"` : ''}><i style="background:${n.cat === c ? 'var(--paper)' : CAT_COLOR[c]}"></i>${c}</button>`).join('');
  const tagBtns = n.cat === '경제' ? ECON_TAGS.map((t) => `<button type="button" class="nsub" data-etag="${t}" aria-pressed="${n.tags.includes(t)}">#${t}</button>`).join('') : '';
  const imgs = (n.images || []).map((im) => `<figure class="nimg"><a href="${esc(im.url)}" target="_blank" rel="noopener"><img src="${esc(im.url)}" alt="노트 사진" loading="lazy"></a><button type="button" class="nimg-x" data-delimg="${im.id}" aria-label="사진 지우기">✕</button></figure>`).join('');
  return `<div class="nedit">
    <div class="nmeta">${single ? `<a class="icon-btn" href="#/notes" aria-label="목록으로">${BACK}</a>` : ''}${catBtns}<span class="nsubs inl">${tagBtns}</span>
      <input type="date" id="n-date" value="${esc(n.date)}" aria-label="날짜"></div>
    <input id="n-title" class="ntitle head" maxlength="300" placeholder="제목" value="${esc(n.title)}" autocomplete="off">
    <textarea id="n-text" class="ruled ntext" placeholder="내용을 적어 보세요">${esc(n.text || '')}</textarea>
    <div class="nimgs">${imgs}
      <label class="nimg-add${n.uploading ? ' busy' : ''}">${n.uploading ? '올리는 중…' : `${PLUS}<span>사진</span>`}<input type="file" id="n-file" accept="image/*" multiple hidden${n.uploading ? ' disabled' : ''}></label></div>
    <div class="nfoot"><span id="n-status" class="notice">${esc(st.status || '쓰면 자동으로 저장돼요 · 사진은 노션에 바로 올라가요')}</span>
      ${n.id ? `<button type="button" class="linkbtn danger" data-delnote>${n.confirmDel ? '한 번 더 누르면 삭제' : '노트 지우기'}</button>` : ''}</div>
  </div>`;
}

export async function renderNotes(el, ctx) {
  const arg = ctx.arg || '';
  const st = { notes: [], open: null, loaded: false, configured: true, error: null, status: '' };
  const single = ctx.mode !== 'spread';
  const showEditor = single ? !!arg : true;

  const paint = () => {
    if (single) {
      el.innerHTML = showEditor ? editorHtml(st, true)
        : `<header class="sw-head"><span style="width:44px"></span><span class="ttl"><span class="head">노트</span></span><a class="icon-btn" href="#/notes/new" aria-label="새 노트">${PLUS}</a></header><div class="rs-body">${listHtml(st)}</div>`;
    } else {
      el.innerHTML = `<div class="page left"><div class="rd">
          <header class="rd-head"><span class="t"><span class="head">노트</span><span class="cnt">${st.notes.length}개</span></span><a class="pill" href="#/notes/new">${PLUS}새 노트</a></header>
          ${listHtml(st)}</div></div>
        <div class="page right"><div class="rd nr">${editorHtml(st, false)}</div></div>`;
    }
    bind();
  };

  const setStatus = (s) => { st.status = s; const e = el.querySelector('#n-status'); if (e && ctx.isCurrent()) e.textContent = s; };

  // 노트 저장 (처음 저장이면 새 페이지를 만들고 주소를 바꿈)
  async function save() {
    const n = st.open;
    if (!n || st.configured === false) return;
    if (!n.id && !n.title.trim() && !n.text.trim()) return;
    setStatus('저장 중…');
    const r = await noteAction({ action: 'save', id: n.id, title: n.title, cat: n.cat, tags: n.cat === '경제' ? n.tags : [], date: n.date, text: n.text });
    if (!r.ok) { setStatus(`저장 안 됨 (${errText(r.error)})`); return; }
    const isNew = !n.id;
    n.id = r.note.id;
    const i = st.notes.findIndex((x) => x.id === n.id);
    if (i >= 0) st.notes[i] = r.note; else st.notes.unshift(r.note);
    setStatus('저장됨');
    if (isNew) { lastOpen = n; history.replaceState(null, '', `#/notes/${n.id}`); }
    if (!single && ctx.isCurrent()) { const l = el.querySelector('.page.left .rd'); if (l) { const keep = l.querySelector('.nlist')?.scrollTop; l.innerHTML = `<header class="rd-head"><span class="t"><span class="head">노트</span><span class="cnt">${st.notes.length}개</span></span><a class="pill" href="#/notes/new">${PLUS}새 노트</a></header>${listHtml(st)}`; const nl = l.querySelector('.nlist'); if (nl && keep) nl.scrollTop = keep; } }
  }
  const schedule = (delay = 1200) => {
    if (pending) clearTimeout(pending.timer);
    pending = { run: save, timer: setTimeout(flushSave, delay) };
    setStatus('입력 중…');
  };

  function grow(t) { t.style.height = 'auto'; t.style.height = `${Math.max(t.scrollHeight, 204)}px`; }

  function bind() {
    const n = st.open;
    const title = el.querySelector('#n-title'), text = el.querySelector('#n-text'), date = el.querySelector('#n-date'), file = el.querySelector('#n-file');
    if (title) title.oninput = () => { n.title = title.value; schedule(); };
    if (text) { if (single) grow(text); text.oninput = () => { n.text = text.value; if (single) grow(text); schedule(); }; }
    if (date) date.onchange = () => { n.date = date.value; schedule(0); };
    if (file) file.onchange = async () => {
      const files = [...file.files];
      if (!files.length) return;
      if (!n.id) { await flushSave(); if (!n.id) { n.title = n.title || '사진 노트'; await save(); } }
      if (!n.id) return;
      n.uploading = true; paint();
      for (const f of files) {
        const blob = await shrink(f).catch(() => null);
        if (!blob) { setStatus('사진을 읽지 못했어요'); continue; }
        const r = await uploadNoteImage(n.id, blob, (f.name || 'photo').replace(/\.\w+$/, '') + '.jpg');
        if (r.ok) (n.images ||= []).push(r.image); else { setStatus(`${errText(r.error)}${r.detail ? ` (${r.detail})` : ''}`); }
      }
      n.uploading = false;
      if (ctx.isCurrent()) { const keepStatus = st.status; paint(); setStatus(keepStatus.startsWith('사진') || keepStatus.includes('못') ? keepStatus : '사진을 올렸어요'); }
    };
  }

  el.onclick = async (ev) => {
    const t = ev.target;
    const c = t.closest('[data-cat]');
    if (c) { filter = { cat: c.dataset.cat, tag: '' }; paint(); return; }
    const ft = t.closest('[data-ftag]');
    if (ft) { filter.tag = filter.tag === ft.dataset.ftag ? '' : ft.dataset.ftag; paint(); return; }
    const n = st.open;
    if (!n) return;
    const ec = t.closest('[data-ecat]');
    if (ec) { n.cat = n.cat === ec.dataset.ecat ? '' : ec.dataset.ecat; if (n.cat !== '경제') n.tags = []; paint(); schedule(0); return; }
    const et = t.closest('[data-etag]');
    if (et) { const g = et.dataset.etag; n.tags = n.tags.includes(g) ? n.tags.filter((x) => x !== g) : [...n.tags, g]; paint(); schedule(0); return; }
    const di = t.closest('[data-delimg]');
    if (di) {
      if (!confirmImg(di)) return;
      const r = await deleteNoteImage(di.dataset.delimg);
      if (r.ok) { n.images = n.images.filter((x) => x.id !== di.dataset.delimg); paint(); setStatus('사진을 지웠어요'); } else setStatus(errText(r.error));
      return;
    }
    if (t.closest('[data-delnote]')) {
      if (!n.confirmDel) { n.confirmDel = true; paint(); return; }
      if (pending) { clearTimeout(pending.timer); pending = null; }
      const r = await noteAction({ action: 'delete', id: n.id });
      if (!r.ok) { setStatus(errText(r.error)); return; }
      st.notes = st.notes.filter((x) => x.id !== n.id);
      lastOpen = null;
      location.hash = '#/notes';
    }
  };
  // 사진 지우기는 두 번 눌러야 (첫 번째는 표시만)
  function confirmImg(btn) {
    if (btn.dataset.armed) return true;
    btn.dataset.armed = '1'; btn.textContent = '지우기?'; btn.classList.add('armed');
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = '✕'; btn.classList.remove('armed'); } }, 2500);
    return false;
  }

  // 열 노트 정하기
  if (showEditor) {
    if (arg === 'new') st.open = { id: null, title: '', cat: filter.cat !== '전체' ? filter.cat : '메모', tags: filter.tag ? [filter.tag] : [], date: todayKey(), text: '', images: [] };
    else if (/^[0-9a-f]{32}$/.test(arg)) st.open = lastOpen?.id === arg ? lastOpen : { id: arg, loading: true };
  }
  paint();
  if (arg === 'new') el.querySelector('#n-title')?.focus();

  const [list, one] = await Promise.all([
    single && showEditor ? Promise.resolve(null) : getNotes(),
    st.open?.loading ? getNote(arg) : Promise.resolve(null),
  ]);
  if (!ctx.isCurrent()) return;
  if (list) Object.assign(st, { notes: list.notes || [], configured: list.configured !== false, error: list.error || null });
  if (one) {
    if (one.note) { st.open = { ...one.note }; lastOpen = st.open; } else { st.open = null; st.error = one.error || null; }
    if (one.configured === false) st.configured = false;
  }
  st.loaded = true;
  paint();
}

window.addEventListener('hashchange', () => { flushSave(); });
window.addEventListener('pagehide', () => { flushSave(); });
