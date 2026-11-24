// 큐티: 왼쪽 = 성경말씀 + 해설(스킬이 올린 내용), 오른쪽 = 묵상·기도(직접 쓰기, 자동 저장)
// iPhone: 한 면에 말씀 → 해설(접기/펼치기) → 묵상 → 기도
import { todayKey, parseKey, addDaysKey, weekStartOf, monIndex, esc, HOLIDAYS, DOW_EN_LOWER, DOW_KO } from '../util.js';
import { getQt, saveQt } from '../api.js';

const ARROW_L = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>';
const ARROW_R = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>';
const MSG = { offline: '인터넷 연결 확인', notion_not_shared: '노션 연결 확인', not_configured: '노션 연결 전' };

let pending = null;
let saveTimer = null;
let noteOpen = false;

async function flushSave(setStatus) {
  clearTimeout(saveTimer);
  if (!pending) return;
  const { date, med, pray, st } = pending;
  pending = null;
  if (st.configured === false) return;
  setStatus?.('저장 중…');
  const r = await saveQt(date, med, pray);
  if (r.ok) st.week[date] = med.trim() || pray.trim() ? 'done' : (st.entry ? 'word' : st.week[date]);
  setStatus?.(r.ok ? '저장됨' : `저장 안 됨 (${MSG[r.error] || r.error})`);
  st.onSaved?.();
}

function dayInfo(key) {
  const { y, m, d } = parseKey(key);
  const dow = monIndex(y, m, d);
  return { y, m, d, dow, red: dow === 6 || !!HOLIDAYS[key], label: `${m}.${d}`, en: DOW_EN_LOWER[dow] };
}

function versesHtml(st) {
  const e = st.entry;
  if (!st.loaded) return '<p class="muted qt-empty">불러오는 중…</p>';
  if (!e || !e.verses?.length) return `<p class="muted qt-empty">${st.configured ? '이 날은 아직 큐티 말씀이 없어요.<br>큐티 스킬로 올리면 여기에 나와요' : '노션 연결 전이에요'}</p>`;
  return `<div class="qt-verses">${e.verses.map((v) => (v.n ? `<p><span class="vn">${esc(v.n)}</span><span>${esc(v.t)}</span></p>` : `<p class="vsub">${esc(v.t)}</p>`)).join('')}</div>`;
}

function noteHtml(st) {
  const t = st.entry?.note;
  return t ? `<div class="qt-note">${esc(t)}</div>` : '<div class="qt-note muted">해설이 없어요</div>';
}

function weekDots(st) {
  const mon = weekStartOf(st.date);
  return `<span class="qt-week">${DOW_KO.map((k, i) => {
    const key = addDaysKey(mon, i);
    const v = st.week[key];
    const cls = ['dot', v === 'done' && 'done', v === 'word' && 'word', key === st.date && 'cur'].filter(Boolean).join(' ');
    return `<a class="${cls}" href="#/qt/${key}" title="${k}요일${v === 'done' ? ' · 묵상 씀' : v === 'word' ? ' · 말씀만' : ''}" aria-label="${k}요일"></a>`;
  }).join('')}<small>이번 주 큐티</small></span>`;
}

const status0 = (st) => (st.configured === false ? '노션 연결 전이라 저장되지 않아요' : '쓰면 자동으로 저장돼요');

function writeHtml(st) {
  const e = st.entry || {};
  return `
    <label class="qt-field"><span class="qt-h">묵상</span>
      <textarea id="q-med" class="ruled grow" rows="3" placeholder="말씀을 읽고 마음에 남은 것을 적어 보세요">${esc(e.med || '')}</textarea></label>
    <label class="qt-field"><span class="qt-h">기도</span>
      <textarea id="q-pray" class="ruled grow" rows="2" placeholder="오늘의 기도">${esc(e.pray || '')}</textarea></label>`;
}

function navHtml(st) {
  return `<a class="icon-btn" href="#/qt/${addDaysKey(st.date, -1)}" aria-label="이전 날">${ARROW_L}</a>
          <a class="icon-btn" href="#/qt/${addDaysKey(st.date, 1)}" aria-label="다음 날">${ARROW_R}</a>`;
}
const backHtml = (st) => (st.date === st.today ? '' : '<a class="go-now" href="#/qt">오늘로 ↩</a>');

function spreadHtml(st) {
  const d = dayInfo(st.date);
  const e = st.entry;
  return `
  <div class="page left"><div class="qt">
    <header class="qt-top">
      <span class="d"><span class="head muted" style="font-size:15px">${d.y}</span><span class="head" style="font-size:32px;color:${d.red ? 'var(--red)' : 'var(--ink)'}">${d.label}</span><span class="head" style="font-size:18px;color:${d.red ? 'var(--red)' : 'var(--ink)'}">${d.en}</span>${backHtml(st)}</span>
      <span>${navHtml(st)}</span>
    </header>
    <div class="qt-scroll">
    <section class="qt-word">
      <div class="qt-sh"><span class="qt-h">성경말씀</span><span class="muted">${esc(e?.range || '')}</span></div>
      ${e?.title && e.title !== st.date ? `<div class="qt-title">${esc(e.title)}</div>` : ''}
      ${versesHtml(st)}
    </section>
    ${e?.verses?.length || e?.note ? `<section class="qt-ex"><span class="qt-h">해설</span>${noteHtml(st)}</section>` : ''}
    </div>
  </div></div>
  <div class="page right"><div class="qt qt-r">
    <header class="qt-top"><span class="muted" style="font-size:13px">묵상과 기도는 직접 써요</span>${weekDots(st)}</header>
    ${writeHtml(st)}
    <span id="q-status" class="notice qt-foot">${status0(st)}</span>
  </div></div>`;
}

function singleHtml(st) {
  const d = dayInfo(st.date);
  const e = st.entry;
  return `
  <header class="sw-head">
    <a class="icon-btn" href="#/qt/${addDaysKey(st.date, -1)}" aria-label="이전 날">${ARROW_L}</a>
    <span class="ttl"><small>${d.y} · 큐티</small><span style="display:flex;align-items:baseline;gap:6px"><span class="head" style="color:${d.red ? 'var(--red)' : 'var(--ink)'}">${d.label}</span><span class="head" style="font-size:15px;color:${d.red ? 'var(--red)' : 'var(--ink)'}">${d.en}</span></span>${backHtml(st)}</span>
    <a class="icon-btn" href="#/qt/${addDaysKey(st.date, 1)}" aria-label="다음 날">${ARROW_R}</a>
  </header>
  <div class="qs-body">
    <section class="qt-word">
      <div class="qt-sh"><span class="qt-h">성경말씀</span><span class="muted">${esc(e?.range || '')}</span></div>
      ${e?.title && e.title !== st.date ? `<div class="qt-title">${esc(e.title)}</div>` : ''}
      ${versesHtml(st)}
    </section>
    ${e?.verses?.length || e?.note ? `<section class="qs-note">
      <button type="button" class="qs-tg" data-note aria-expanded="${noteOpen}"><span class="qt-h">해설</span><span class="muted">${noteOpen ? '접기' : '펼치기'}</span></button>
      ${noteOpen ? noteHtml(st) : ''}
    </section>` : ''}
    ${writeHtml(st)}
    <span id="q-status" class="notice">${status0(st)}</span>
  </div>`;
}

function grow(t) {
  t.style.height = 'auto';
  t.style.height = `${Math.max(t.scrollHeight, Number(t.getAttribute('rows')) * 34)}px`;
}

export async function renderQt(el, ctx) {
  const today = todayKey();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(ctx.arg || '') ? ctx.arg : today;
  const st = { date, today, entry: null, week: {}, loaded: false, configured: true };

  const bind = () => {
    const med = el.querySelector('#q-med');
    const pray = el.querySelector('#q-pray');
    const status = el.querySelector('#q-status');
    const setStatus = (s) => { if (status?.isConnected) status.textContent = s; };
    st.onSaved = () => { if (!ctx.isCurrent()) return; const w = el.querySelector('.qt-week'); if (w) w.outerHTML = weekDots(st); };
    const onInput = () => {
      st.entry = { ...(st.entry || {}), med: med.value, pray: pray.value };
      pending = { st, date, med: med.value, pray: pray.value };
      clearTimeout(saveTimer);
      if (st.configured !== false) setStatus('입력 중…');
      saveTimer = setTimeout(() => flushSave(setStatus), 1200);
    };
    for (const t of [med, pray]) {
      grow(t);
      t.addEventListener('input', () => { grow(t); onInput(); });
    }
  };
  const paint = () => {
    el.innerHTML = ctx.mode === 'spread' ? spreadHtml(st) : singleHtml(st);
    bind();
  };
  paint();

  const data = await getQt(date);
  if (!ctx.isCurrent()) return;
  // 불러오는 사이에 이미 쓰기 시작했으면 쓴 내용 유지
  const typed = pending?.date === date ? { med: pending.med, pray: pending.pray } : null;
  st.entry = data.entry ? { ...data.entry, ...(typed || {}) } : (typed ? { ...typed } : null);
  st.week = data.week || {};
  st.configured = data.configured !== false;
  st.loaded = true;
  const hadFocus = document.activeElement?.id;
  paint();
  if (hadFocus) el.querySelector(`#${hadFocus}`)?.focus();
  if (data.error) {
    const s = el.querySelector('#q-status');
    if (s) s.textContent = `불러오지 못했어요 (${MSG[data.error] || data.error})`;
  }

  el.onclick = (ev) => {
    if (ev.target.closest('[data-note]')) {
      noteOpen = !noteOpen;
      const keep = { med: el.querySelector('#q-med')?.value, pray: el.querySelector('#q-pray')?.value };
      if (st.entry) Object.assign(st.entry, keep);
      paint();
    }
  };
}

window.addEventListener('hashchange', () => { flushSave(); });
window.addEventListener('pagehide', () => { flushSave(); });
