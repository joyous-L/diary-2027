// 독서: 완독 리스트(한 해 표) + 책갈피(문장 카드, 책별 거르기)
// iPhone: 위쪽 완독 | 책갈피 전환
import { todayKey, todayParts, esc } from '../util.js';
import { getBooks, bookAction, getMarks, markAction } from '../api.js';

const ARROW_L = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>';
const ARROW_R = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>';
const PLUS = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M7 2v10M2 7h10"/></svg>';
const GENRES = ['인문', '철학', '소설', '역사', '경제', '신앙', '기타'];
const ROWS_PER_PAGE = 16;
const ERR = { offline: '인터넷 연결을 확인해 주세요', notion_not_shared: '노션 연결을 확인해 주세요', not_configured: '노션 연결 전이에요', bad_dates: '끝난 날이 시작일보다 빨라요' };
const errText = (e) => (e ? ERR[e] || '저장하지 못했어요. 잠시 뒤 다시 해 주세요' : '');

const md = (k) => (k ? `${Number(k.slice(5, 7))}.${Number(k.slice(8, 10))}` : '');
function period(b) {
  if (!b.start && !b.end) return '';
  if (!b.end || b.end === b.start) return md(b.start || b.end);
  const s = b.start.slice(0, 4) !== b.end.slice(0, 4) ? `${b.start.slice(2, 4)}.${md(b.start)}` : md(b.start);
  return `${s}~${md(b.end)}`;
}
const yearOf = (b) => Number((b.end || b.start || '').slice(0, 4)) || null;

function segHtml(active) {
  return `<div class="seg" role="tablist">
    <a role="tab" href="#/books" aria-selected="${active === 'books'}">완독</a>
    <a role="tab" href="#/marks" aria-selected="${active === 'marks'}">책갈피</a>
  </div>`;
}

// ── 공통 입력 창 ──
function field(label, inner) { return `<label class="hf"><span>${label}</span>${inner}</label>`; }
const input = (id, v, extra = '') => `<input id="${id}" value="${esc(v || '')}" autocomplete="off" ${extra}>`;

function dialogHtml(d) {
  if (!d) return '';
  let body = '';
  if (d.kind === 'book') {
    const g = GENRES.map((k) => `<button type="button" class="catbtn" data-genre="${k}" aria-pressed="${d.genre === k}"${d.genre === k ? ' style="background:var(--accent);color:var(--paper);border-color:var(--accent)"' : ''}>${k}</button>`).join('');
    body = `${field('책 제목', input('f-title', d.title, 'maxlength="200" placeholder="예: 데미안"'))}
      <div class="hrow2">${field('작가', input('f-author', d.author, 'maxlength="200"'))}${field('출판사', input('f-pub', d.pub, 'maxlength="200"'))}</div>
      <div class="hf"><span>분야</span><div class="cats">${g}</div></div>
      <div class="hrow2">${field('읽기 시작', input('f-start', d.start, 'type="date"'))}${field('다 읽은 날', input('f-end', d.end, 'type="date"'))}</div>`;
  } else {
    body = `<div class="hrow2">${field('책 제목', input('f-book', d.book, 'maxlength="200" list="f-books" placeholder="책 제목"'))}${field('작가', input('f-author', d.author, 'maxlength="200"'))}</div>
      <datalist id="f-books">${d.titles.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
      ${field('문장', `<textarea id="f-text" rows="4" maxlength="5000" placeholder="책에서 건진 문장">${esc(d.text || '')}</textarea>`)}
      ${field('한마디', input('f-note', d.note, 'maxlength="2000" placeholder="생각 한 줄 (안 써도 돼요)"'))}
      ${field('날짜', input('f-date', d.date, 'type="date"'))}`;
  }
  const title = (d.kind === 'book' ? '완독 ' : '책갈피 ') + (d.id ? '고치기' : '추가');
  return `<div class="dlg-back" data-close>
    <div class="dlg hdlg rdlg" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="dlg-h"><span class="head" style="font-size:24px">${title}</span><button type="button" class="icon-btn" data-close aria-label="닫기">✕</button></div>
      ${body}
      <div class="hdlg-f">
        ${d.id ? `<button type="button" class="linkbtn danger" data-del>${d.confirmDel ? '한 번 더 누르면 삭제' : '지우기'}</button>` : '<span></span>'}
        <span class="msg" role="status">${esc(d.msg || '')}</span>
        <button type="button" class="btn" data-save${d.busy ? ' disabled' : ''}>${d.busy ? '저장 중…' : '저장'}</button>
      </div>
    </div></div>`;
}

// 창 안의 입력값을 상태로 옮기기 (다시 그려도 지워지지 않게)
function readForm(el, d) {
  const v = (id) => el.querySelector(`#${id}`)?.value ?? '';
  if (d.kind === 'book') Object.assign(d, { title: v('f-title'), author: v('f-author'), pub: v('f-pub'), start: v('f-start'), end: v('f-end') });
  else Object.assign(d, { book: v('f-book'), author: v('f-author'), text: v('f-text'), note: v('f-note'), date: v('f-date') });
}

function bindDialog(el, st, paint, saveFn, delFn) {
  el.onkeydown = (ev) => {
    if (!st.dlg) return;
    if (ev.key === 'Escape') { st.dlg = null; paint(); }
  };
  el.oninput = (ev) => {
    // 책갈피: 아는 책 제목을 고르면 작가 자동 채우기
    if (st.dlg?.kind === 'mark' && ev.target.id === 'f-book') {
      const a = st.authorOf?.[ev.target.value.trim()];
      const au = el.querySelector('#f-author');
      if (a && au && !au.value) au.value = a;
    }
  };
  return async (t) => {
    const d = st.dlg;
    const closeBtn = t.closest('[data-close]');
    if (closeBtn && (closeBtn.classList.contains('dlg-back') ? t === closeBtn : true)) { st.dlg = null; paint(); return true; }
    const g = t.closest('[data-genre]');
    if (g) { readForm(el, d); d.genre = d.genre === g.dataset.genre ? '' : g.dataset.genre; paint(); return true; }
    if (t.closest('[data-save]')) {
      if (d.busy) return true;
      readForm(el, d);
      const need = d.kind === 'book' ? d.title.trim() : d.book.trim() && d.text.trim();
      if (!need) { d.msg = d.kind === 'book' ? '책 제목을 써 주세요' : '책 제목과 문장을 써 주세요'; paint(); return true; }
      d.busy = true; d.msg = ''; paint();
      const r = await saveFn(d);
      if (!r.ok) { d.busy = false; d.msg = errText(r.error); paint(); return true; }
      st.dlg = null; paint(); return true;
    }
    if (t.closest('[data-del]')) {
      readForm(el, d);
      if (!d.confirmDel) { d.confirmDel = true; paint(); return true; }
      d.busy = true; paint();
      const r = await delFn(d);
      if (!r.ok) { d.busy = false; d.msg = errText(r.error); paint(); return true; }
      st.dlg = null; paint(); return true;
    }
    return true; // 창이 열려 있으면 바깥 클릭은 무시
  };
}

const statusLine = (st) => (st.error ? `<p class="hl-status">${esc(errText(st.error))}</p>` : '');
const loadingLine = (st, empty) => (!st.loaded ? '<p class="muted hl-empty">불러오는 중…</p>' : !st.configured ? '<p class="muted hl-empty">노션 연결 전이에요</p>' : `<p class="muted hl-empty">${empty}</p>`);

// ════════ 완독 ════════
function bookRows(list, from, n) {
  const out = [];
  for (let i = from; i < from + n; i++) {
    const b = list[i];
    out.push(b
      ? `<button type="button" class="bk-row" data-edit="${b.id}"><span class="no">${i + 1}</span><span class="g">${esc(b.genre)}</span><span class="t">${esc(b.title)}</span><span>${esc(b.author)}</span><span>${esc(b.pub)}</span><span class="p">${esc(period(b))}</span></button>`
      : `<button type="button" class="bk-row empty" data-add tabindex="-1" aria-hidden="true"><span class="no">${i + 1}</span><span></span><span></span><span></span><span></span><span></span></button>`);
  }
  return out.join('');
}
const BK_HEAD = '<div class="bk-head"><span>NO.</span><span>분야</span><span>제목</span><span>작가</span><span>출판사</span><span>독서 기간</span></div>';

function yearNav(st, route) {
  const back = st.year === st.thisYear ? '' : `<a class="go-now" href="#/${route}">올해로 ↩</a>`;
  return `<span class="yr-nav"><a class="icon-btn sm" href="#/${route}/${st.year - 1}" aria-label="지난해">${ARROW_L}</a>${st.year}<a class="icon-btn sm" href="#/${route}/${st.year + 1}" aria-label="다음 해">${ARROW_R}</a>${back}</span>`;
}

function booksSpread(st) {
  const list = st.books.filter((b) => yearOf(b) === st.year);
  const rightN = Math.max(ROWS_PER_PAGE, list.length - ROWS_PER_PAGE);
  return `
  <div class="page left"><div class="rd">
    <header class="rd-head"><span class="t"><span class="head">완독 리스트</span><span class="cnt">${yearNav(st, 'books')} · ${list.length}권</span></span>
      <button type="button" class="pill" data-add>${PLUS}추가</button></header>
    ${BK_HEAD}<div class="bk-body">${bookRows(list, 0, ROWS_PER_PAGE)}</div>
    ${!st.loaded || !st.configured || st.error ? (statusLine(st) || loadingLine(st, '')) : ''}
  </div></div>
  <div class="page right"><div class="rd">
    <header class="rd-head" style="justify-content:flex-end"><span class="muted" style="font-size:12px">줄을 누르면 고칠 수 있어요</span></header>
    ${BK_HEAD}<div class="bk-body scroll">${bookRows(list, ROWS_PER_PAGE, rightN)}</div>
  </div></div>
  ${dialogHtml(st.dlg)}`;
}

function booksSingle(st) {
  const list = st.books.filter((b) => yearOf(b) === st.year);
  const items = list.map((b, i) => `<button type="button" class="bs-row" data-edit="${b.id}">
      <span class="no">${i + 1}</span>
      <span class="mid"><span class="tt"><span class="t">${esc(b.title)}</span>${b.genre ? `<span class="g">${esc(b.genre)}</span>` : ''}</span><small>${esc([b.author, b.pub].filter(Boolean).join(' · '))}</small></span>
      <span class="p">${esc(period(b))}</span></button>`).reverse().join('');
  return `<header class="sw-head"><span style="width:44px"></span><span class="ttl"><span class="head">독서</span></span><button type="button" class="icon-btn" data-add aria-label="완독 추가">${PLUS}</button></header>
    ${segHtml('books')}
    <div class="rs-body">
      <div class="rs-cap">${yearNav(st, 'books')}<span>${list.length}권 다 읽음</span></div>
      ${statusLine(st)}
      ${items || loadingLine(st, '이 해에 다 읽은 책이 아직 없어요')}
    </div>
    ${dialogHtml(st.dlg)}`;
}

export async function renderBooks(el, ctx) {
  const thisYear = todayParts().y;
  const year = /^\d{4}$/.test(ctx.arg || '') ? Number(ctx.arg) : thisYear;
  const st = { year, thisYear, books: [], loaded: false, configured: true, error: null, dlg: null };
  const paint = () => { el.innerHTML = ctx.mode === 'spread' ? booksSpread(st) : booksSingle(st); };
  paint();
  const data = await getBooks();
  if (!ctx.isCurrent()) return;
  Object.assign(st, { books: data.books || [], configured: data.configured !== false, error: data.error || null, loaded: true });
  paint();

  const dlgClick = bindDialog(el, st, paint, async (d) => {
    const body = { action: d.id ? 'update' : 'add', id: d.id, title: d.title, author: d.author, pub: d.pub, genre: d.genre, start: d.start, end: d.end };
    const r = await bookAction(body);
    if (r.ok) {
      st.books = d.id ? st.books.map((b) => (b.id === d.id ? r.book : b)) : [...st.books, r.book];
      st.books.sort((a, b) => (a.end || a.start || '').localeCompare(b.end || b.start || ''));
    }
    return r;
  }, async (d) => {
    const r = await bookAction({ action: 'delete', id: d.id });
    if (r.ok) st.books = st.books.filter((b) => b.id !== d.id);
    return r;
  });

  el.onclick = async (ev) => {
    const t = ev.target;
    if (st.dlg) { await dlgClick(t); return; }
    if (t.closest('[data-add]')) {
      if (!st.configured) return;
      const today = todayKey();
      st.dlg = { kind: 'book', title: '', author: '', pub: '', genre: '', start: '', end: st.year === st.thisYear ? today : '' };
      paint(); el.querySelector('#f-title')?.focus(); return;
    }
    const ed = t.closest('[data-edit]');
    if (ed) {
      const b = st.books.find((x) => x.id === ed.dataset.edit);
      if (b) { st.dlg = { kind: 'book', ...b }; paint(); }
    }
  };
}

// ════════ 책갈피 ════════
function markCard(q) {
  return `<button type="button" class="mk" data-edit="${q.id}">
    <span class="ribbon" aria-hidden="true"></span>
    <span class="tx">${esc(q.text)}</span>
    <span class="meta"><span>${esc(q.book)}${q.author ? ` · ${esc(q.author)}` : ''}</span><span>${esc(md(q.date))}</span></span>
    ${q.note ? `<span class="nt"><small>한마디</small>${esc(q.note)}</span>` : ''}
  </button>`;
}

function filterChips(st) {
  const names = ['전체', ...new Set(st.marks.map((m) => m.book))];
  if (names.length <= 1) return '';
  return `<div class="mk-filters" role="tablist" aria-label="책으로 거르기">${names.map((n) =>
    `<button type="button" role="tab" class="fchip" data-filter="${esc(n)}" aria-selected="${st.f === n}">${esc(n)}</button>`).join('')}</div>`;
}

const filtered = (st) => st.marks.filter((m) => st.f === '전체' || m.book === st.f);

function marksSpread(st) {
  const list = filtered(st);
  const a = list.filter((_, i) => i % 2 === 0), b = list.filter((_, i) => i % 2 === 1);
  const empty = loadingLine(st, '책을 읽다 건진 문장을 남겨 보세요');
  return `
  <div class="page left"><div class="rd">
    <header class="rd-head"><span class="t"><span class="head">책갈피</span><span class="cnt">${st.marks.length}개</span></span></header>
    ${filterChips(st)}
    ${statusLine(st)}
    <div class="mk-col scroll">${a.map(markCard).join('') || empty}</div>
  </div></div>
  <div class="page right"><div class="rd">
    <header class="rd-head" style="justify-content:flex-end"><button type="button" class="pill" data-add>${PLUS}책갈피 추가</button></header>
    <div class="mk-col scroll">${b.map(markCard).join('')}<button type="button" class="mk-add" data-add>책을 읽다 건진 문장을 남겨 보세요</button></div>
  </div></div>
  ${dialogHtml(st.dlg)}`;
}

function marksSingle(st) {
  const list = filtered(st);
  return `<header class="sw-head"><span style="width:44px"></span><span class="ttl"><span class="head">독서</span></span><button type="button" class="icon-btn" data-add aria-label="책갈피 추가">${PLUS}</button></header>
    ${segHtml('marks')}
    <div class="rs-body">
      ${filterChips(st)}
      ${statusLine(st)}
      ${list.map(markCard).join('') || loadingLine(st, '책을 읽다 건진 문장을 남겨 보세요')}
    </div>
    ${dialogHtml(st.dlg)}`;
}

let lastFilter = '전체';

export async function renderMarks(el, ctx) {
  const st = { marks: [], f: lastFilter, loaded: false, configured: true, error: null, dlg: null, authorOf: {} };
  const paint = () => { el.innerHTML = ctx.mode === 'spread' ? marksSpread(st) : marksSingle(st); };
  paint();
  const [data, bk] = await Promise.all([getMarks(), getBooks()]);
  if (!ctx.isCurrent()) return;
  Object.assign(st, { marks: data.marks || [], configured: data.configured !== false, error: data.error || null, loaded: true });
  for (const b of bk.books || []) if (b.title && b.author) st.authorOf[b.title] = b.author;
  for (const m of st.marks) if (m.book && m.author) st.authorOf[m.book] = m.author;
  if (!st.marks.some((m) => m.book === st.f)) st.f = '전체';
  paint();

  const titles = () => [...new Set([...st.marks.map((m) => m.book), ...(bk.books || []).map((b) => b.title)])].filter(Boolean);
  const dlgClick = bindDialog(el, st, paint, async (d) => {
    const r = await markAction({ action: d.id ? 'update' : 'add', id: d.id, book: d.book, author: d.author, text: d.text, note: d.note, date: d.date });
    if (r.ok) {
      st.marks = d.id ? st.marks.map((m) => (m.id === d.id ? r.mark : m)) : [r.mark, ...st.marks];
      st.marks.sort((x, y) => (y.date || '').localeCompare(x.date || ''));
      if (r.mark.author) st.authorOf[r.mark.book] = r.mark.author;
    }
    return r;
  }, async (d) => {
    const r = await markAction({ action: 'delete', id: d.id });
    if (r.ok) { st.marks = st.marks.filter((m) => m.id !== d.id); if (!st.marks.some((m) => m.book === st.f)) st.f = '전체'; }
    return r;
  });

  el.onclick = async (ev) => {
    const t = ev.target;
    if (st.dlg) { await dlgClick(t); return; }
    const f = t.closest('[data-filter]');
    if (f) { st.f = lastFilter = f.dataset.filter; paint(); return; }
    if (t.closest('[data-add]')) {
      if (!st.configured) return;
      const book = st.f !== '전체' ? st.f : '';
      st.dlg = { kind: 'mark', book, author: st.authorOf[book] || '', text: '', note: '', date: todayKey(), titles: titles() };
      paint(); el.querySelector(book ? '#f-text' : '#f-book')?.focus(); return;
    }
    const ed = t.closest('[data-edit]');
    if (ed) {
      const m = st.marks.find((x) => x.id === ed.dataset.edit);
      if (m) { st.dlg = { kind: 'mark', ...m, titles: titles() }; paint(); }
    }
  };
}
