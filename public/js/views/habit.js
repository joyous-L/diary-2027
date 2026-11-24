// 습관: 왼쪽 = 습관 목록(추가·켜기/끄기·이름 눌러 고치기), 오른쪽 = 이달의 체크 표
// iPhone: 칩으로 고른 습관의 한 달 달력 + 목록
import { todayParts, todayKey, ymd, ym, addMonths, daysIn, monIndex, esc, CAT_COLOR, HOLIDAYS } from '../util.js';
import { getHabits, habitAction, setHabit } from '../api.js';

const ARROW_L = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>';
const ARROW_R = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>';
const PLUS = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M7 2v10M2 7h10"/></svg>';
const CATS = Object.keys(CAT_COLOR);
const OFF = '#C4BEB1';

const ERR = {
  offline: '인터넷 연결을 확인해 주세요',
  notion_not_shared: '노션 연결을 확인해 주세요',
  not_configured: '노션 연결 전이에요',
};
const errText = (e) => (e ? ERR[e] || '저장하지 못했어요. 잠시 뒤 다시 해 주세요' : '');

function parseMonth(arg) {
  const mt = /^(\d{4})-(\d{2})$/.exec(arg || '');
  if (mt) return { y: +mt[1], m: +mt[2] };
  const t = todayParts();
  return { y: t.y, m: t.m };
}

// 이 달에서 "지난 날" 수 (시작일 이전·오늘 이후는 빼기)
function stats(st, h) {
  const first = ymd(st.y, st.m, 1), last = ymd(st.y, st.m, daysIn(st.y, st.m));
  const from = h.start && h.start > first ? h.start : first;
  const to = st.today < last ? st.today : last;
  let total = 0;
  if (from <= to) total = Number(to.slice(8)) - Number(from.slice(8)) + 1;
  const done = Object.keys(st.checks[h.id] || {}).filter((k) => k >= from && k <= to).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

const startLabel = (s) => (s ? `${Number(s.slice(5, 7))}.${Number(s.slice(8))}부터` : '');
const color = (h) => (h.on ? CAT_COLOR[h.cat] || '#6F6B63' : OFF);

function switchHtml(h, big) {
  return `<button type="button" class="hsw${big ? ' big' : ''}" role="switch" aria-checked="${h.on}" data-toggle="${h.id}" aria-label="${esc(h.name)} 켜기/끄기"><span class="trk"><span class="knob"></span></span></button>`;
}

function rowHtml(st, h) {
  const s = stats(st, h);
  const c = color(h);
  return `<div class="hl-row${h.on ? '' : ' off'}">
    <span class="bar" style="background:${c}"></span>
    <button type="button" class="hl-name" data-edit="${h.id}" aria-label="${esc(h.name)} 고치기">
      <span class="n">${esc(h.name)}</span><small>${esc(h.cat)}${h.start ? ` · ${startLabel(h.start)}` : ''}</small>
    </button>
    <div class="hl-prog"><div class="tr"><div style="width:${s.pct}%;background:${c}"></div></div><small>${s.done}일 / ${s.total}일 · ${s.pct}%</small></div>
    ${switchHtml(h)}
  </div>`;
}

function legendHtml() {
  return `<div class="hl-legend">${CATS.map((k) => `<span><i style="background:${CAT_COLOR[k]}"></i>${k}</span>`).join('')}</div>`;
}

function emptyHtml(st) {
  if (!st.loaded) return '<p class="muted hl-empty">불러오는 중…</p>';
  if (!st.configured) return '<p class="muted hl-empty">노션 연결 전이에요</p>';
  return '<p class="muted hl-empty">아직 습관이 없어요. <b>습관 추가</b>로 시작해 보세요</p>';
}

function dayClass(st, key, dow) {
  return [key === st.today && 'today', (dow === 6 || HOLIDAYS[key]) && 'red', key > st.today && 'future'].filter(Boolean).join(' ');
}

function tableHtml(st) {
  const n = daysIn(st.y, st.m);
  const on = st.habits.filter((h) => h.on);
  const heads = [];
  for (let d = 1; d <= n; d++) {
    const key = ymd(st.y, st.m, d);
    heads.push(`<span class="${dayClass(st, key, monIndex(st.y, st.m, d))}">${d}</span>`);
  }
  const rows = on.map((h) => {
    const c = CAT_COLOR[h.cat] || '#6F6B63';
    const cells = [];
    for (let d = 1; d <= n; d++) {
      const key = ymd(st.y, st.m, d);
      const v = !!st.checks[h.id]?.[key];
      const fut = key > st.today;
      cells.push(`<button type="button" class="tc${key === st.today ? ' today' : ''}" data-habit="${h.id}" data-day="${key}" aria-pressed="${v}" aria-label="${esc(h.name)} ${st.m}월 ${d}일"${fut ? ' disabled' : ''}><i style="${v ? `background:${c};border-color:${c}` : ''}"></i></button>`);
    }
    return `<div class="ht-row"><span class="ht-name">${esc(h.name)}</span><div class="ht-cells" style="--n:${n}">${cells.join('')}</div></div>`;
  }).join('');
  return `<div class="ht">
    <div class="ht-row ht-head"><span class="ht-name"></span><div class="ht-cells" style="--n:${n}">${heads.join('')}</div></div>
    ${rows || `<p class="muted hl-empty">${st.habits.length ? '켜 둔 습관이 없어요' : '습관을 추가하면 여기에 체크 표가 나와요'}</p>`}
  </div>`;
}

function headHtml(st, single) {
  const prev = addMonths(st.y, st.m, -1), next = addMonths(st.y, st.m, 1);
  const isNow = st.today.startsWith(ym(st.y, st.m));
  const back = isNow ? '' : `<a class="go-now" href="#/habit">이번 달로 ↩</a>`;
  if (single) {
    return `<header class="sw-head">
      <a class="icon-btn" href="#/habit/${ym(prev.y, prev.m)}" aria-label="지난달">${ARROW_L}</a>
      <span class="ttl"><small>${st.y} · ${st.m}월</small><span class="head">습관</span>${back}</span>
      <span style="display:flex"><a class="icon-btn" href="#/habit/${ym(next.y, next.m)}" aria-label="다음 달">${ARROW_R}</a><button type="button" class="icon-btn" data-add aria-label="습관 추가">${PLUS}</button></span>
    </header>`;
  }
  return `<header class="hl-head">
    <div class="t"><span class="ym"><a class="icon-btn sm" href="#/habit/${ym(prev.y, prev.m)}" aria-label="지난달">${ARROW_L}</a>${st.y} · ${st.m}월<a class="icon-btn sm" href="#/habit/${ym(next.y, next.m)}" aria-label="다음 달">${ARROW_R}</a>${back}</span><span class="head">Habit</span></div>
    <button type="button" class="pill" data-add>${PLUS}습관 추가</button>
  </header>`;
}

function statusHtml(st) {
  const t = errText(st.error);
  return t ? `<div class="hl-status" role="status">${esc(t)}</div>` : '';
}

function spreadHtml(st) {
  return `
  <div class="page left"><div class="hl">
    ${headHtml(st)}
    ${legendHtml()}
    <div class="hl-list">${st.habits.length ? st.habits.map((h) => rowHtml(st, h)).join('') : emptyHtml(st)}</div>
    <span class="hl-foot">켜 둔 습관만 주간 화면 첫 칸과 오른쪽 표에 나와요 · 이름을 누르면 고칠 수 있어요</span>
  </div></div>
  <div class="page right"><div class="hl hr">
    <header class="hl-head"><span class="sec">이달의 기록</span><small class="muted">칸을 눌러 체크</small></header>
    ${tableHtml(st)}
    ${statusHtml(st)}
  </div></div>
  ${dialogHtml(st)}`;
}

function calHtml(st, h) {
  const n = daysIn(st.y, st.m);
  const c = CAT_COLOR[h.cat] || '#6F6B63';
  const cells = [];
  for (let i = 0; i < monIndex(st.y, st.m, 1); i++) cells.push('<span></span>');
  for (let d = 1; d <= n; d++) {
    const key = ymd(st.y, st.m, d);
    const v = !!st.checks[h.id]?.[key];
    const fut = key > st.today;
    cells.push(`<button type="button" class="cc" data-habit="${h.id}" data-day="${key}" aria-pressed="${v}" aria-label="${esc(h.name)} ${st.m}월 ${d}일"${fut ? ' disabled' : ''}>
      <span style="${v ? `background:${c};color:var(--paper);` : ''}${key === st.today ? `border-color:${c};` : ''}">${d}</span></button>`);
  }
  const s = stats(st, h);
  return `<section class="hc">
    <div class="hc-h"><span class="head">${esc(h.name)}</span><small>${s.done}일 / ${s.total}일 · ${s.pct}%</small></div>
    <div class="hc-dow"><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span><span class="red">일</span></div>
    <div class="hc-grid">${cells.join('')}</div>
  </section>`;
}

function singleHtml(st) {
  const on = st.habits.filter((h) => h.on);
  if (!on.some((h) => h.id === st.sel)) st.sel = on[0]?.id || null;
  const cur = on.find((h) => h.id === st.sel);
  const chips = on.map((h) => {
    const sel = h.id === st.sel, c = CAT_COLOR[h.cat] || '#6F6B63';
    return `<button type="button" class="hchip" data-pick="${h.id}" aria-pressed="${sel}" style="${sel ? `background:${c};color:var(--paper)` : ''}"><i style="background:${sel ? 'var(--paper)' : c}"></i>${esc(h.name)}</button>`;
  }).join('');
  const list = st.habits.map((h) => {
    const c = color(h);
    return `<div class="hs-row${h.on ? '' : ' off'}"><span class="bar" style="background:${c}"></span>
      <button type="button" class="hl-name" data-edit="${h.id}" aria-label="${esc(h.name)} 고치기"><span class="n">${esc(h.name)}</span><small style="color:${c}">${esc(h.cat)} · ${stats(st, h).pct}%</small></button>
      ${switchHtml(h, true)}</div>`;
  }).join('');
  return `${headHtml(st, true)}
  <div class="hs-body">
    ${on.length ? `<div class="hchips">${chips}</div>${calHtml(st, cur)}` : ''}
    ${statusHtml(st)}
    <section><span class="hs-cap">습관 목록 · 켜 둔 것만 주간에 나와요</span>${list || emptyHtml(st)}</section>
  </div>
  ${dialogHtml(st)}`;
}

// 습관 추가·고치기 창
function dialogHtml(st) {
  const d = st.dlg;
  if (!d) return '';
  const cats = CATS.map((k) => `<button type="button" class="catbtn" data-cat="${k}" aria-pressed="${d.cat === k}" style="${d.cat === k ? `background:${CAT_COLOR[k]};color:var(--paper);border-color:${CAT_COLOR[k]}` : ''}"><i style="background:${d.cat === k ? 'var(--paper)' : CAT_COLOR[k]}"></i>${k}</button>`).join('');
  return `<div class="dlg-back" data-close>
    <div class="dlg hdlg" role="dialog" aria-modal="true" aria-label="${d.id ? '습관 고치기' : '습관 추가'}">
      <div class="dlg-h"><span class="head">${d.id ? '습관 고치기' : '습관 추가'}</span><button type="button" class="icon-btn" data-close aria-label="닫기">✕</button></div>
      <label class="hf"><span>이름</span><input id="h-name" maxlength="60" placeholder="예: 탄천 걷기" value="${esc(d.name)}" autocomplete="off"></label>
      <div class="hf"><span>분류</span><div class="cats">${cats}</div></div>
      <div class="hdlg-f">
        ${d.id ? `<button type="button" class="linkbtn danger" data-del>${d.confirmDel ? '정말 지울까요? 한 번 더 누르면 삭제' : '이 습관 지우기'}</button>` : '<span></span>'}
        <span class="msg" role="status">${esc(d.msg || '')}</span>
        <button type="button" class="btn" data-save${d.busy ? ' disabled' : ''}>${d.busy ? '저장 중…' : '저장'}</button>
      </div>
    </div>
  </div>`;
}

export async function renderHabit(el, ctx) {
  const { y, m } = parseMonth(ctx.arg);
  const st = { y, m, today: todayKey(), habits: [], checks: {}, loaded: false, configured: true, error: null, sel: null, dlg: null };
  const paint = () => {
    const focusName = document.activeElement?.id === 'h-name';
    const pos = focusName ? document.activeElement.selectionStart : null;
    el.innerHTML = ctx.mode === 'spread' ? spreadHtml(st) : singleHtml(st);
    if (st.dlg && (focusName || st.dlg.focus)) {
      const inp = el.querySelector('#h-name');
      inp.focus();
      if (pos != null) inp.setSelectionRange(pos, pos);
      st.dlg.focus = false;
    }
  };
  paint();

  const data = await getHabits(ym(y, m));
  if (!ctx.isCurrent()) return;
  st.habits = data.habits || [];
  st.checks = data.checks || {};
  st.configured = data.configured !== false;
  st.error = data.error || null;
  st.loaded = true;
  paint();

  const openDlg = (h) => {
    st.dlg = h ? { id: h.id, name: h.name, cat: h.cat || '생활', focus: true } : { id: null, name: '', cat: '건강관리', focus: true };
    paint();
  };

  async function save() {
    const d = st.dlg;
    d.name = el.querySelector('#h-name')?.value.trim() || '';
    if (!d.name) { d.msg = '이름을 써 주세요'; d.focus = true; paint(); return; }
    d.busy = true; d.msg = ''; paint();
    const r = d.id
      ? await habitAction({ action: 'update', id: d.id, name: d.name, cat: d.cat })
      : await habitAction({ action: 'add', name: d.name, cat: d.cat });
    if (!r.ok) { d.busy = false; d.msg = errText(r.error); paint(); return; }
    if (d.id) st.habits = st.habits.map((h) => (h.id === d.id ? r.habit : h));
    else { st.habits.push(r.habit); st.sel = r.habit.id; }
    st.dlg = null; paint();
  }

  el.onclick = async (ev) => {
    const t = ev.target;
    if (st.dlg) {
      const closeBtn = t.closest('[data-close]');
      if (closeBtn && (closeBtn.classList.contains('dlg-back') ? t === closeBtn : true)) { st.dlg = null; paint(); return; }
      const cat = t.closest('[data-cat]');
      if (cat) { st.dlg.name = el.querySelector('#h-name').value; st.dlg.cat = cat.dataset.cat; paint(); return; }
      if (t.closest('[data-save]')) { if (!st.dlg.busy) save(); return; }
      if (t.closest('[data-del]')) {
        const d = st.dlg;
        if (!d.confirmDel) { d.name = el.querySelector('#h-name').value; d.confirmDel = true; paint(); return; }
        d.busy = true; paint();
        const r = await habitAction({ action: 'delete', id: d.id });
        if (!r.ok) { d.busy = false; d.msg = errText(r.error); paint(); return; }
        st.habits = st.habits.filter((h) => h.id !== d.id);
        st.dlg = null; paint();
      }
      return;
    }
    if (t.closest('[data-add]')) { if (st.configured) openDlg(null); return; }
    const edit = t.closest('[data-edit]');
    if (edit) { openDlg(st.habits.find((h) => h.id === edit.dataset.edit)); return; }
    const pick = t.closest('[data-pick]');
    if (pick) { st.sel = pick.dataset.pick; paint(); return; }
    const tog = t.closest('[data-toggle]');
    if (tog) {
      const h = st.habits.find((x) => x.id === tog.dataset.toggle);
      if (!h) return;
      h.on = !h.on; st.error = null; paint();
      const r = await habitAction({ action: 'update', id: h.id, on: h.on });
      if (!r.ok) { h.on = !h.on; st.error = r.error; paint(); }
      return;
    }
    const dot = t.closest('[data-habit]');
    if (dot && !dot.disabled) {
      const hid = dot.dataset.habit, key = dot.dataset.day;
      const on = !st.checks[hid]?.[key];
      st.checks[hid] = { ...(st.checks[hid] || {}) };
      if (on) st.checks[hid][key] = 'pending'; else delete st.checks[hid][key];
      st.error = null; paint();
      const h = st.habits.find((x) => x.id === hid);
      const r = await setHabit(hid, h?.name || '', key, on);
      if (!r.ok) {
        if (on) delete st.checks[hid][key]; else st.checks[hid][key] = 'x';
        st.error = r.error; paint();
      }
    }
  };

  el.onkeydown = (ev) => {
    if (!st.dlg) return;
    if (ev.key === 'Escape') { st.dlg = null; paint(); }
    else if (ev.key === 'Enter' && ev.target.id === 'h-name' && !ev.isComposing) { ev.preventDefault(); if (!st.dlg.busy) save(); }
  };
}
