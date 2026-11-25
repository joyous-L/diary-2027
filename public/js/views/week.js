// 주간: 01_Routine 일정 + 감사 한 줄 + 일기(눌러서 펼치기) + 이번 주 습관
import { getEvents, groupByDate, getWeek, saveDiary, setHabit } from '../api.js';
import {
  todayKey, parseKey, addDaysKey, weekStartOf, weekTitle, monIndex, esc, eventLabel,
  DOW_KO, DOW_EN_LOWER, HOLIDAYS, CAT_COLOR, datePill, isDue, keepScroll } from '../util.js';

const ARROW_L = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>';
const ARROW_R = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>';
const CLOSE = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 3l10 10M13 3 3 13"/></svg>';

let selected = null;     // 한 면 보기에서 고른 날
let openDay = null;      // 일기 창이 열린 날
let saveTimer = null;
let pending = null;

const NOTION_MSG = {
  notion_not_shared: '노션 연결 확인 필요',
  offline: '인터넷 연결 확인 필요',
};

function dayInfo(key) {
  const { y, m, d } = parseKey(key);
  const dow = monIndex(y, m, d);
  const hol = HOLIDAYS[key] || '';
  return { key, y, m, d, dow, hol, red: dow === 6 || !!hol, label: `${m}.${d}`, en: DOW_EN_LOWER[dow] };
}

function routineLines(evs) {
  return evs.map((e) => `<span class="rt"><b>${esc(e.allDay ? '종일' : (e.start === e.end ? e.start : `${e.start}~${e.end}`))}</b><span>${esc(e.title)}</span></span>`).join('');
}

function habitBlock(st, compactLabel) {
  if (!st.habits.length) {
    return `<p class="w-empty">${st.configured ? '습관을 추가하면 여기에 나와요' : '노션 연결 후 습관이 나와요'}</p>`;
  }
  return st.habits.map((h) => {
    const dots = st.days.map((day, i) => {
      const on = !!st.checks[h.id]?.[day.key];
      if (!on && !isDue(h, day.key)) return `<span class="hdot rest${st.sel === day.key ? ' col' : ''}" aria-hidden="true"><i></i></span>`;
      const color = CAT_COLOR[h.cat] || 'var(--accent)';
      return `<button type="button" class="hdot${st.sel === day.key ? ' col' : ''}" data-habit="${h.id}" data-day="${day.key}" aria-pressed="${on}"
        aria-label="${esc(h.name)} ${DOW_KO[i]}요일"><i style="border-color:${on ? color : 'var(--hint)'};background:${on ? color : 'transparent'}"></i></button>`;
    }).join('');
    return `<div class="hrow"><span class="hname">${esc(h.name)}${compactLabel ? '' : ''}</span><span class="hdots">${dots}</span></div>`;
  }).join('');
}

// 넘치는 칸만 아래를 흐리게. 일기 미리보기는 줄(34px) 단위로 높이를 맞춰 반쯤 걸친 줄이 없게
function fitFades(root) {
  requestAnimationFrame(() => {
    for (const n of root.querySelectorAll('.fadebox')) {
      n.classList.remove('over');
      if (n.classList.contains('snap')) {
        n.style.maxHeight = '';
        const lh = parseFloat(getComputedStyle(n).lineHeight) || 34;
        const h = Math.max(lh, Math.floor(n.clientHeight / lh) * lh);
        n.style.maxHeight = `${h}px`;
      }
      n.classList.toggle('over', n.scrollHeight > n.clientHeight + 2);
    }
  });
}

// 감사: 노션 "감사" 칸에 줄바꿈으로 최대 3개 저장
const THANKS_N = 3;
const thanksList = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
function thanksSlots(t) {
  const a = String(t || '').split('\n');
  const out = a.slice(0, THANKS_N - 1);
  out.push(a.slice(THANKS_N - 1).join(' '));
  while (out.length < THANKS_N) out.push('');
  return out.map((x) => x.trim());
}

const PEN = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 16l1-3.5L13.5 4a1.4 1.4 0 0 1 2 0l.5.5a1.4 1.4 0 0 1 0 2L7.5 15z"/><path d="M12 5.5l2.5 2.5"/></svg>';

// PC 요일 칸: 일정 | 감사(전부 보임) | 일기(있으면 아이콘 · 넘치면 아래가 흐려짐)
function dayCell(st, day) {
  const evs = st.routine[day.key] || [];
  const dia = st.diary[day.key] || {};
  const th = thanksList(dia.thanks);
  const hasDia = !!(dia.text && dia.text.trim());
  return `<button type="button" class="wday" data-open="${day.key}" aria-label="${day.m}월 ${day.d}일 일기 열기${hasDia ? ', 일기 있음' : ''}">
    <span class="wday-h">${datePill(day.label, day.en, { red: day.red, today: day.key === st.today })}${day.hol ? `<span class="hol">${esc(day.hol)}</span>` : ''}</span>
    ${evs.length ? `<span class="wday-rt fadebox">${routineLines(evs)}</span>` : ''}
    <span class="wsec wsec-th"><em>감사</em>${th.length
      ? `<span class="th-items">${th.map((x, i) => `<span><b>${i + 1}</b>${esc(x)}</span>`).join('')}</span>`
      : '<span class="wsec-empty">—</span>'}</span>
    <span class="wsec wsec-dia${hasDia ? ' on' : ''}">
      <em>일기${hasDia ? `<span class="dia-ic" title="일기 있음">${PEN}</span>` : ''}</em>
      ${hasDia ? `<span class="ruled preview fadebox snap">${esc(dia.text)}</span><span class="more-cue">이어서 ›</span>` : '<span class="wsec-empty">—</span>'}
    </span>
  </button>`;
}

function statusText(st) {
  if (!st.loaded) return '불러오는 중';
  const parts = [];
  if (st.routineStatus) parts.push(st.routineStatus);
  if (st.configured === false) parts.push('노션 연결 전 · 저장 안 됨');
  else if (st.error) parts.push(NOTION_MSG[st.error] || '노션을 불러오지 못했어요');
  return parts.join(' · ');
}

const isThisWeek = (st) => st.start === weekStartOf(st.today);

function spreadHtml(st) {
  const t = weekTitle(st.start);
  const prev = addDaysKey(st.start, -7), next = addDaysKey(st.start, 7);
  const first = `<section class="wcell whab">
    <header class="whab-h">
      <a class="icon-btn" href="#/week/${prev}" aria-label="지난주">${ARROW_L}</a>
      <span class="ttl"><small>${t.y} · ${t.label}</small>${isThisWeek(st) ? '<span class="head">이번 주</span>' : '<a class="head go-now" href="#/week" title="오늘이 있는 주로 가기">이번 주로 ↩</a>'}</span>
      <a class="icon-btn" href="#/week/${next}" aria-label="다음 주">${ARROW_R}</a>
    </header>
    <div class="hhead"><span class="sec">습관</span><span class="hdots">${DOW_KO.map((d, i) => `<span${i === 6 ? ' style="color:var(--red)"' : ''}>${d}</span>`).join('')}</span></div>
    <div class="whab-list">${habitBlock(st)}</div>
  </section>`;
  const cells = st.days.map((d) => dayCell(st, d));
  return `
  <div class="page left"><div class="wgrid">${first}${cells.slice(0, 3).join('')}</div></div>
  <div class="page right"><div class="wgrid">${cells.slice(3).join('')}</div>
    <div class="legend wlegend">01_Routine 일정${statusText(st) ? ` · ${esc(statusText(st))}` : ''}</div></div>`;
}

function singleHtml(st) {
  const t = weekTitle(st.start);
  const prev = addDaysKey(st.start, -7), next = addDaysKey(st.start, 7);
  const day = dayInfo(st.sel);
  const evs = st.routine[st.sel] || [];
  const dia = st.diary[st.sel] || {};
  const chips = st.days.map((d, i) => {
    const on = d.key === st.sel;
    const has = !!st.diary[d.key]?.text;
    return `<button type="button" role="tab" class="chip${on ? ' on' : ''}" data-sel="${d.key}" aria-selected="${on}" aria-label="${d.m}월 ${d.d}일 ${DOW_KO[i]}요일${has ? ', 일기 있음' : ''}">
      <small style="${!on && d.red ? 'color:var(--red)' : ''}">${DOW_KO[i]}</small><span class="head" style="${!on && d.red ? 'color:var(--red)' : ''}">${d.d}</span><i style="background:${has ? (on ? 'var(--paper)' : 'var(--accent)') : 'transparent'}"></i></button>`;
  }).join('');
  return `
  <header class="sw-head">
    <a class="icon-btn" href="#/week/${prev}" aria-label="지난주">${ARROW_L}</a>
    <span class="ttl"><small>${t.y} · ${st.days[0].label} – ${st.days[6].label}</small><span class="head">${t.label}</span>${isThisWeek(st) ? '' : '<a class="go-now" href="#/week">이번 주로 ↩</a>'}</span>
    <a class="icon-btn" href="#/week/${next}" aria-label="다음 주">${ARROW_R}</a>
  </header>
  <div class="sw-chips" role="tablist" aria-label="요일 선택">${chips}</div>
  <div class="sw-body">
    <section class="sw-day">
      <div class="sw-dh"><span class="head" style="font-size:24px;color:${day.red ? 'var(--red)' : 'var(--ink)'}">${day.label}</span>
        <span class="head" style="font-size:16px;color:${day.red ? 'var(--red)' : 'var(--ink)'}">${day.en}</span>${day.hol ? `<span class="hol">${esc(day.hol)}</span>` : ''}</div>
      <div class="sw-rt">${routineLines(evs) || '<span class="muted" style="font-size:14px">루틴 기록 없음</span>'}</div>
      <button type="button" class="sw-open" data-open="${st.sel}">
        <span class="thanks th-list"><em>감사</em>${thanksList(dia.thanks).length
          ? `<span class="th-items">${thanksList(dia.thanks).map((x, i) => `<span><b>${i + 1}</b>${esc(x)}</span>`).join('')}</span>`
          : '<span style="color:var(--hint)">감사 세 가지 남기기</span>'}</span>
        <span class="preview4" style="color:${dia.text ? 'var(--ink)' : 'var(--hint)'}">${esc(dia.text || '아직 쓴 일기가 없어요')}</span>
        <span class="go">일기 열기 ›</span>
      </button>
    </section>
    <section class="sw-hab">
      <div class="hhead"><span class="sec">이번 주 습관</span><span class="hdots">${DOW_KO.map((d, i) => `<span${i === 6 ? ' style="color:var(--red)"' : ''}>${d}</span>`).join('')}</span></div>
      ${habitBlock(st, true)}
    </section>
    <p class="notice" style="padding:0 4px">${esc(statusText(st))}</p>
  </div>`;
}

function diaryHtml(st, key) {
  const day = dayInfo(key);
  const evs = st.routine[key] || [];
  const dia = st.diary[key] || {};
  const idx = st.days.findIndex((d) => d.key === key);
  return `<div class="dlg-back" data-close="1">
    <div class="dlg" role="dialog" aria-modal="true" aria-label="${day.m}월 ${day.d}일 일기">
      <header class="dlg-h">
        <span class="d"><small>${day.y}</small><span class="head" style="color:${day.red ? 'var(--red)' : 'var(--ink)'}">${day.label}</span><span class="head en" style="color:${day.red ? 'var(--red)' : 'var(--ink)'}">${day.en}</span></span>
        <span>
          <button type="button" class="icon-btn" data-move="-1" aria-label="이전 날" ${idx <= 0 ? 'disabled' : ''}>${ARROW_L}</button>
          <button type="button" class="icon-btn" data-move="1" aria-label="다음 날" ${idx >= 6 ? 'disabled' : ''}>${ARROW_R}</button>
          <button type="button" class="icon-btn" data-close="1" aria-label="닫기">${CLOSE}</button>
        </span>
      </header>
      <div class="dlg-chips">${evs.map((e) => `<span class="tag"><b>${esc(e.allDay ? '종일' : (e.start === e.end ? e.start : `${e.start}~${e.end}`))}</b>${esc(e.title)}</span>`).join('')}</div>
      <div class="dlg-thanks"><span>감사</span><div class="th-ins">${thanksSlots(dia.thanks).map((v, i) =>
        `<label><b>${i + 1}</b><input type="text" class="f-thanks" maxlength="300" value="${esc(v)}" placeholder="${['감사한 일', '하나 더', '마지막 하나'][i]}" aria-label="감사 ${i + 1}"></label>`).join('')}</div></div>
      <label class="dlg-text"><span>일기</span><textarea id="f-text" class="ruled" placeholder="오늘 하루를 적어 보세요">${esc(dia.text || '')}</textarea></label>
      <footer class="dlg-f"><span id="f-status" class="notice">${st.configured === false ? '노션 연결 전이라 저장되지 않아요' : '쓰면 자동으로 저장돼요'}</span>
        <button type="button" class="btn" data-close="1">완료</button></footer>
    </div>
  </div>`;
}

async function flushSave(setStatus) {
  clearTimeout(saveTimer);
  if (!pending) return;
  const { st, key, thanks, text } = pending;
  pending = null;
  if (st.configured === false) return;
  setStatus?.('저장 중…');
  const r = await saveDiary(key, thanks, text);
  setStatus?.(r.ok ? '저장됨' : `저장 안 됨 (${NOTION_MSG[r.error] || r.error})`);
}

export async function renderWeek(el, ctx) {
  const today = todayKey();
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(ctx.arg || '') ? ctx.arg : today;
  const start = weekStartOf(anchor);
  const days = Array.from({ length: 7 }, (_, i) => dayInfo(addDaysKey(start, i)));
  if (!selected || !days.some((d) => d.key === selected)) {
    selected = days.some((d) => d.key === anchor) && ctx.arg ? anchor : (days.some((d) => d.key === today) ? today : start);
  }
  const st = { start, days, today, sel: selected, routine: {}, diary: {}, habits: [], checks: {}, loaded: false, configured: true, error: null, routineStatus: '' };

  const paint = () => {
    st.sel = selected;
    // 다시 그려도 스크롤 위치 유지 (습관 칸 안 스크롤 · 화면 스크롤)
    keepScroll(el, () => { el.innerHTML = (ctx.mode === 'spread' ? spreadHtml(st) : singleHtml(st)) + (openDay ? diaryHtml(st, openDay) : ''); });
    fitFades(el);
    if (openDay) bindDialog();
  };

  const bindDialog = () => {
    const thanksIns = [...el.querySelectorAll('.f-thanks')];
    const thanks = { get value() { const v = thanksIns.map((n) => n.value.replace(/\n/g, ' ').trim()); while (v.length && !v[v.length - 1]) v.pop(); return v.join('\n'); } };
    const text = el.querySelector('#f-text');
    const status = el.querySelector('#f-status');
    const setStatus = (s) => { if (status && status.isConnected) status.textContent = s; };
    const onInput = () => {
      const key = openDay;
      st.diary[key] = { ...(st.diary[key] || {}), thanks: thanks.value, text: text.value };
      pending = { st, key, thanks: thanks.value, text: text.value };
      clearTimeout(saveTimer);
      if (st.configured !== false) setStatus('입력 중…');
      saveTimer = setTimeout(() => flushSave(setStatus), 1200);
    };
    thanksIns.forEach((n, i) => {
      n.addEventListener('input', onInput);
      // Enter → 다음 칸으로
      n.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); (thanksIns[i + 1] || text).focus(); } });
    });
    text.addEventListener('input', onInput);
    (ctx.mode === 'spread' ? text : null)?.focus();
  };

  paint();

  const [rt, wk] = await Promise.all([getEvents('routine', start, addDaysKey(start, 7)), getWeek(start)]);
  if (!ctx.isCurrent()) return;
  st.routine = groupByDate(rt.events || []);
  st.routineStatus = rt.configured === false ? '캘린더 연결 전' : rt.error ? '일정을 불러오지 못했어요' : '';
  st.diary = wk.diary || {};
  st.habits = wk.habits || [];
  st.checks = wk.checks || {};
  st.configured = wk.configured !== false;
  st.error = wk.error || null;
  st.loaded = true;
  paint();

  el.onclick = async (ev) => {
    const t = ev.target;
    const closeBtn = t.closest('[data-close]');
    if (closeBtn && (closeBtn.classList.contains('dlg-back') ? t === closeBtn : true)) {
      await flushSave();
      openDay = null; paint(); return;
    }
    const move = t.closest('[data-move]');
    if (move) {
      await flushSave();
      const i = st.days.findIndex((d) => d.key === openDay) + Number(move.dataset.move);
      if (i >= 0 && i < 7) { openDay = st.days[i].key; selected = openDay; paint(); }
      return;
    }
    const sel = t.closest('[data-sel]');
    if (sel) { selected = sel.dataset.sel; paint(); return; }
    const dot = t.closest('[data-habit]');
    if (dot) {
      if (!st.configured) return;
      const hid = dot.dataset.habit, key = dot.dataset.day;
      const on = !st.checks[hid]?.[key];
      st.checks[hid] = { ...(st.checks[hid] || {}) };
      if (on) st.checks[hid][key] = 'pending'; else delete st.checks[hid][key];
      paint();
      const h = st.habits.find((x) => x.id === hid);
      const r = await setHabit(hid, h?.name || '', key, on);
      if (!r.ok) { // 되돌리기
        if (on) delete st.checks[hid][key]; else st.checks[hid][key] = 'x';
        st.error = r.error; paint();
      }
      return;
    }
    const open = t.closest('[data-open]');
    if (open) { openDay = open.dataset.open; selected = openDay; paint(); }
  };

  el.onkeydown = (ev) => {
    if (ev.key === 'Escape' && openDay) { flushSave(); openDay = null; paint(); }
  };
}

// 다른 화면으로 넘어갈 때 쓰던 일기가 있으면 저장
window.addEventListener('hashchange', () => { openDay = null; flushSave(); });
window.addEventListener('pagehide', () => { flushSave(); });
