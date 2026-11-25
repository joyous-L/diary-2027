// 월간: 02_Life + 01_Routine 일정(색으로 구분). PC는 펼친 두 면(월·화·수 | 목·금·토·일), 좁은 창은 한 면 달력 + 고른 날 일정.
import { getEvents, groupByDate } from '../api.js';
import {
  todayParts, todayKey, ymd, ym, addMonths, daysIn, monIndex, monthGrid,
  HOLIDAYS, MONTH_EN, DOW_EN, DOW_KO, esc, eventLabel,
} from '../util.js';

const ARROW_L = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>';
const ARROW_R = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>';
const MAX_EVENTS = 3;

let selectedKey = null; // 한 면 보기에서 고른 날

function parseArg(arg) {
  const mt = /^(\d{4})-(\d{2})$/.exec(arg || '');
  if (mt) return { y: +mt[1], m: +mt[2] };
  const t = todayParts();
  return { y: t.y, m: t.m };
}

const dayColor = (cell, hol) => (!cell.inMonth ? 'var(--fade)' : (cell.dow === 6 || hol) ? 'var(--red)' : 'var(--ink)');

function miniHtml(y, m) {
  const pad0 = monIndex(y, m, 1);
  let cells = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((c, i) => `<span style="color:${i === 6 ? 'var(--red)' : 'var(--muted)'}">${c}</span>`).join('');
  cells += '<span></span>'.repeat(pad0);
  for (let d = 1; d <= daysIn(y, m); d++) {
    const red = (pad0 + d - 1) % 7 === 6 || HOLIDAYS[ymd(y, m, d)];
    cells += `<span style="color:${red ? 'var(--red)' : 'var(--ink)'}">${d}</span>`;
  }
  return `<div class="mini"><div class="mh"><b>${String(m).padStart(2, '0')}</b><span>${MONTH_EN[m - 1].slice(0, 3)}</span></div><div class="g">${cells}</div></div>`;
}

function cellHtml(cell, byDate, today) {
  const hol = cell.inMonth ? HOLIDAYS[cell.key] : '';
  const evs = cell.inMonth ? (byDate[cell.key] || []) : [];
  const shown = evs.slice(0, MAX_EVENTS).map((e) => `<span class="ev${e.cal === 'routine' ? ' rt' : ''}">${esc(eventLabel(e))}</span>`).join('');
  const more = evs.length > MAX_EVENTS ? `<span class="more">+${evs.length - MAX_EVENTS}</span>` : '';
  const label = `${cell.m}월 ${cell.d}일${hol ? ` ${hol}` : ''}${evs.length ? `, 일정 ${evs.length}개` : ''}`;
  return `<button type="button" class="mcell${cell.key === today ? ' today' : ''}" data-key="${cell.key}" aria-label="${esc(label)}">
    <span class="top"><span class="n" style="color:${dayColor(cell, hol)}">${cell.d}</span>${hol ? `<span class="hol">${esc(hol)}</span>` : ''}</span>
    ${shown}${more}</button>`;
}

function spreadHtml(y, m, weeks, byDate, status) {
  const prev = addMonths(y, m, -1), next = addMonths(y, m, 1);
  const today = todayKey();
  const left = weeks.map((w) => `<div class="mrow c3">${w.slice(0, 3).map((c) => cellHtml(c, byDate, today)).join('')}</div>`).join('');
  const right = weeks.map((w) => `<div class="mrow c4">${w.slice(3).map((c) => cellHtml(c, byDate, today)).join('')}</div>`).join('');
  return `
  <div class="page left"><div class="m-left">
    <aside class="m-side">
      <div>
        <div class="yr">${y}</div>
        <div class="num">${String(m).padStart(2, '0')}</div>
        <div class="en">${MONTH_EN[m - 1]}</div>
        <div class="nav">
          <a class="icon-btn" href="#/month/${ym(prev.y, prev.m)}" aria-label="지난달">${ARROW_L}</a>
          <a class="icon-btn" href="#/month/${ym(next.y, next.m)}" aria-label="다음 달">${ARROW_R}</a>
        </div>
        ${today.startsWith(ym(y, m)) ? '' : '<a class="go-now" href="#/month">이번 달로 ↩</a>'}
      </div>
      <div>${miniHtml(prev.y, prev.m)}${miniHtml(next.y, next.m)}</div>
    </aside>
    <div class="mgrid">
      <div class="mhead c3">${DOW_EN.slice(0, 3).map((d) => `<span>${d}</span>`).join('')}</div>${left}
    </div>
  </div></div>
  <div class="page right"><div class="m-right">
    <div class="mgrid">
      <div class="mhead c4">${DOW_EN.slice(3).map((d, i) => `<span${i === 3 ? ' style="color:var(--red)"' : ''}>${d}</span>`).join('')}</div>${right}
    </div>
    <div class="legend"><span class="lg">02_Life</span><span class="lg rt">01_Routine</span>${status}</div>
  </div></div>`;
}

function singleHtml(y, m, weeks, byDate, status) {
  const prev = addMonths(y, m, -1), next = addMonths(y, m, 1);
  const today = todayKey();
  if (!selectedKey || !selectedKey.startsWith(ym(y, m))) {
    selectedKey = today.startsWith(ym(y, m)) ? today : ymd(y, m, 1);
  }
  const rows = weeks.map((w) => `<div class="sm-week">${w.map((c) => {
    const hol = c.inMonth ? HOLIDAYS[c.key] : '';
    const evs = c.inMonth ? (byDate[c.key] || []) : [];
    const dots = evs.slice(0, 3).map((e) => (e.cal === 'routine' ? '<i class="rt"></i>' : '<i></i>')).join('') || (hol ? '<i class="h"></i>' : '');
    const cls = ['sm-day', c.key === selectedKey && 'sel', c.key === today && 'today'].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}" data-key="${c.key}" ${c.inMonth ? '' : 'tabindex="-1"'} aria-pressed="${c.key === selectedKey}"
      aria-label="${c.m}월 ${c.d}일${evs.length ? `, 일정 ${evs.length}개` : ''}">
      <span class="n" style="color:${dayColor(c, hol)}">${c.d}</span><span class="dots">${dots}</span></button>`;
  }).join('')}</div>`).join('');

  const [, sm, sd] = selectedKey.split('-').map(Number);
  const sdow = monIndex(y, sm, sd);
  const shol = HOLIDAYS[selectedKey];
  const sevs = byDate[selectedKey] || [];
  const list = sevs.length
    ? sevs.map((e) => `<span class="ev${e.cal === 'routine' ? ' rt' : ''}">${esc(eventLabel(e, true))}</span>`).join('')
    : '<span class="muted" style="font-size:15px">일정 없음</span>';

  return `
  <div class="sm-head">
    <div style="display:flex;align-items:flex-end;gap:12px">
      <span class="num">${String(m).padStart(2, '0')}</span>
      <span class="sub"><span class="head muted" style="font-size:15px">${y}</span><span class="head" style="font-size:14px;letter-spacing:2px;color:var(--accent)">${MONTH_EN[m - 1]}</span>${todayKey().startsWith(ym(y, m)) ? '' : '<a class="go-now" href="#/month">이번 달로 ↩</a>'}</span>
    </div>
    <div>
      <a class="icon-btn" href="#/month/${ym(prev.y, prev.m)}" aria-label="지난달">${ARROW_L}</a>
      <a class="icon-btn" href="#/month/${ym(next.y, next.m)}" aria-label="다음 달">${ARROW_R}</a>
    </div>
  </div>
  <div class="sm-grid">
    <div class="sm-dow">${DOW_KO.map((d, i) => `<span${i === 6 ? ' style="color:var(--red)"' : ''}>${d}</span>`).join('')}</div>
    ${rows}
  </div>
  <section class="sm-panel" aria-live="polite">
    <div class="ph"><b style="color:${sdow === 6 || shol ? 'var(--red)' : 'var(--ink)'}">${sm}월 ${sd}일</b><span class="head muted">${DOW_KO[sdow]}요일</span>${shol ? `<span style="color:var(--red);font-size:13px">${esc(shol)}</span>` : ''}</div>
    ${list}
    <span class="notice legend-s" style="margin-top:4px"><span class="lg">02_Life</span><span class="lg rt">01_Routine</span>${status}</span>
  </section>`;
}

export async function renderMonth(el, ctx) {
  const { y, m } = parseArg(ctx.arg);
  const weeks = monthGrid(y, m);
  const first = weeks[0][0].key;
  const lastCell = weeks[weeks.length - 1][6];
  // 마지막 칸 다음 날(월이 넘어가면 다음 달 1일)까지 불러오기
  const endKey = lastCell.d + 1 > daysIn(lastCell.y, lastCell.m)
    ? (() => { const n = addMonths(lastCell.y, lastCell.m, 1); return ymd(n.y, n.m, 1); })()
    : ymd(lastCell.y, lastCell.m, lastCell.d + 1);

  const paint = (byDate, status) => {
    el.innerHTML = ctx.mode === 'spread' ? spreadHtml(y, m, weeks, byDate, status) : singleHtml(y, m, weeks, byDate, status);
  };
  paint({}, ' · 불러오는 중');

  const [life, rt] = await Promise.all([getEvents('life', first, endKey), getEvents('routine', first, endKey)]);
  if (!ctx.isCurrent()) return;
  // 하루 안에서는 02_Life 먼저, 그다음 01_Routine
  const byDate = groupByDate([
    ...(life.events || []).map((e) => ({ ...e, cal: 'life' })),
    ...(rt.events || []).map((e) => ({ ...e, cal: 'routine' })),
  ]);
  const bad = [life, rt].filter((d) => d.configured === false || d.error);
  const status = !bad.length ? '' : bad.some((d) => d.configured === false) ? ' · 캘린더 연결 전' : ' · 일부 불러오지 못했어요';
  paint(byDate, status);

  el.onclick = (ev) => {
    const btn = ev.target.closest('[data-key]');
    if (!btn) return;
    const key = btn.dataset.key;
    if (ctx.mode === 'spread') {
      ctx.go('week', key);
    } else {
      if (!key.startsWith(ym(y, m))) { ctx.go('month', key.slice(0, 7)); selectedKey = key; return; }
      selectedKey = key;
      paint(byDate, status);
    }
  };
}
