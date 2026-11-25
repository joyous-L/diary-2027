// 건강: 컨디션(하루 한 번 · 5단계 + 한 줄 + 증상) · 점 달력 · 진료기록 · 증상 모아보기
// 경로: #/health/YYYY-MM (컨디션) · #/health/tags (증상 모아보기) · #/health/visits (iPhone 진료기록)
import { todayKey, todayParts, ymd, ym, addMonths, daysIn, monIndex, parseKey, esc, HOLIDAYS, DOW_KO, datePill } from '../util.js';
import { getHealth, healthAction } from '../api.js';

const ARROW_L = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>';
const ARROW_R = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>';
const PLUS = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M7 2v10M2 7h10"/></svg>';
const LV = [
  { name: '아주 좋음', color: '#3E7A57' }, { name: '좋음', color: '#8DB39A' }, { name: '보통', color: '#D9CBA8' },
  { name: '안 좋음', color: '#D99A5E' }, { name: '아픔', color: '#B0463C' },
];
const lvColor = (name) => LV.find((l) => l.name === name)?.color || '#C4BEB1';
const BASE_TAGS = ['두통', '허리', '목', '피로'];
const ERR = { offline: '인터넷 연결을 확인해 주세요', notion_not_shared: '노션 연결을 확인해 주세요', not_configured: '노션 연결 전이에요' };
const errText = (e) => (e ? ERR[e] || '저장하지 못했어요' : '');
const md = (k) => (k ? `${Number(k.slice(5, 7))}.${Number(k.slice(8, 10))}` : '');

let selTag = null;
let pending = null; // { st, date, timer }

async function flush() {
  if (!pending) return;
  const { st, date } = pending;
  clearTimeout(pending.timer);
  pending = null;
  const c = st.conds[date] || { level: '', note: '', tags: [] };
  st.status = '저장 중…'; st.repaintStatus?.();
  const r = await healthAction({ kind: 'cond', date, level: c.level, note: c.note, tags: c.tags });
  if (r.ok) {
    if (r.cond) st.conds[date] = r.cond; else delete st.conds[date];
    for (const t of r.cond?.tags || []) if (!st.tags.includes(t)) st.tags.push(t);
    st.status = '저장됨';
  } else st.status = `저장 안 됨 (${errText(r.error)})`;
  st.repaintStatus?.(); st.repaintDots?.();
}
function schedule(st, date, delay) {
  if (pending && pending.date !== date) flush();
  if (pending) clearTimeout(pending.timer);
  pending = { st, date, timer: setTimeout(flush, delay) };
  st.status = '입력 중…';
}

// ── 컨디션 입력 상자 ──
function editBox(st) {
  const d = st.sel;
  if (!d) return '<div class="hb-box muted" style="font-size:13px">날짜를 누르면 그날 컨디션을 남길 수 있어요</div>';
  const c = st.conds[d] || { level: '', note: '', tags: [] };
  const { y, m, d: dd } = parseKey(d);
  const dow = monIndex(y, m, dd);
  const label = `${datePill(md(d), DOW_KO[dow], { red: dow === 6 || !!HOLIDAYS[d], today: d === st.today })}<span class="sec sm">${d === st.today ? '오늘 어때요?' : '어땠어요?'}</span>`;
  const tags = [...new Set([...BASE_TAGS, ...st.tags, ...c.tags])];
  return `<div class="hb-box">
    <div class="hb-top"><span class="hb-q">${label}</span>${st.conds[d] ? '<button type="button" class="linkbtn" data-clear>지우기</button>' : ''}</div>
    <div class="hb-lv" role="radiogroup" aria-label="컨디션">${LV.map((l) => `<button type="button" role="radio" aria-checked="${c.level === l.name}" data-level="${l.name}"><i style="background:${l.color}"></i>${l.name}</button>`).join('')}</div>
    <label class="hb-note"><span>한 줄</span><textarea id="h-note" maxlength="1000" rows="1" placeholder="몸 상태를 짧게 (예: 목이 칼칼함)" autocomplete="off">${esc(c.note)}</textarea></label>
    <div class="hb-tags"><span>증상</span>${tags.map((t) => `<button type="button" class="tg" data-tag="${esc(t)}" aria-pressed="${c.tags.includes(t)}">#${esc(t)}</button>`).join('')}
      ${st.addingTag ? '<input id="h-newtag" class="tg-in" maxlength="20" placeholder="새 증상" autocomplete="off">' : '<button type="button" class="tg add" data-newtag aria-label="증상 추가">+</button>'}</div>
    <span class="notice hb-status" id="h-status">${esc(st.status || (st.configured ? '누르거나 쓰면 자동으로 저장돼요' : '노션 연결 전이에요'))}</span>
  </div>`;
}

function calHtml(st) {
  const n = daysIn(st.y, st.m);
  const cells = [];
  for (let i = 0; i < monIndex(st.y, st.m, 1); i++) cells.push('<span></span>');
  for (let d = 1; d <= n; d++) {
    const key = ymd(st.y, st.m, d);
    const c = st.conds[key];
    const fut = key > st.today;
    const red = monIndex(st.y, st.m, d) === 6 || HOLIDAYS[key];
    const col = c?.level ? lvColor(c.level) : null;
    cells.push(`<button type="button" class="hc-d${key === st.sel ? ' sel' : ''}${key === st.today ? ' today' : ''}" data-day="${key}"${fut ? ' disabled' : ''} aria-label="${st.m}월 ${d}일${c?.level ? ` ${c.level}` : ''}">
      <small${red ? ' class="red"' : ''}>${d}</small><i style="${col ? `background:${col};border-color:${col}` : (c ? 'border-color:var(--muted)' : '')}"></i></button>`);
  }
  return `<div class="hc-cal"><div class="hc-dow">${DOW_KO.map((k, i) => `<span${i === 6 ? ' class="red"' : ''}>${k}</span>`).join('')}</div><div class="hc-cells">${cells.join('')}</div></div>`;
}

function recentHtml(st, max) {
  const pre = ym(st.y, st.m);
  const list = Object.values(st.conds).filter((c) => c.date.startsWith(pre) && (c.note || c.tags.length)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, max);
  return list.map((c) => `<button type="button" class="hr-row" data-day="${c.date}"><span class="d">${md(c.date)}</span><i style="background:${lvColor(c.level)}"></i><span class="lv">${esc(c.level || '—')}</span><span class="nt">${esc(c.note || '')}</span><span class="tg-s">${c.tags.map((t) => `#${esc(t)}`).join(' ')}</span></button>`).join('');
}

function monthHead(st, single) {
  const prev = addMonths(st.y, st.m, -1), next = addMonths(st.y, st.m, 1);
  const back = st.today.startsWith(ym(st.y, st.m)) ? '' : '<a class="go-now" href="#/health">이번 달로 ↩</a>';
  if (single) return `<header class="sw-head"><a class="icon-btn" href="#/health/${ym(prev.y, prev.m)}" aria-label="지난달">${ARROW_L}</a>
    <span class="ttl"><small>${st.y} · ${st.m}월</small><span class="head">건강</span>${back}</span>
    <a class="icon-btn" href="#/health/${ym(next.y, next.m)}" aria-label="다음 달">${ARROW_R}</a></header>`;
  return `<header class="rd-head"><span class="t"><span class="head">컨디션</span><span class="cnt">${st.y} · ${st.m}월</span>${back}</span>
    <span><a class="icon-btn" href="#/health/${ym(prev.y, prev.m)}" aria-label="지난달">${ARROW_L}</a><a class="icon-btn" href="#/health/${ym(next.y, next.m)}" aria-label="다음 달">${ARROW_R}</a></span></header>`;
}

// ── 진료기록 ──
function visitTable(st) {
  const rows = st.visits.map((v) => `<button type="button" class="vt-row" data-visit="${v.id}"><span class="d">${md(v.date)}</span><span>${esc(v.place)}</span><span class="l">${esc(v.why)}</span><span class="l">${esc(v.result)}</span></button>`);
  for (let i = rows.length; i < 15; i++) rows.push('<button type="button" class="vt-row empty" data-addvisit tabindex="-1" aria-hidden="true"><span class="d"></span><span></span><span></span><span></span></button>');
  return `<div class="vt-head"><span>날짜</span><span>병원</span><span>사유</span><span>경과</span></div><div class="vt-body">${rows.join('')}</div>`;
}
function visitCards(st) {
  return st.visits.map((v) => `<button type="button" class="vc" data-visit="${v.id}"><span class="top"><b>${esc(v.place)}</b><small>${md(v.date)}</small></span>
    ${v.why ? `<span><small>사유</small>${esc(v.why)}</span>` : ''}${v.result ? `<span><small>경과</small>${esc(v.result)}</span>` : ''}</button>`).join('')
    || `<p class="muted hl-empty">${st.y}년 진료기록이 아직 없어요</p>`;
}

function visitDialog(st) {
  const d = st.dlg;
  if (!d) return '';
  return `<div class="dlg-back" data-close>
    <div class="dlg hdlg rdlg" role="dialog" aria-modal="true" aria-label="진료기록">
      <div class="dlg-h"><span class="head">진료기록 ${d.id ? '고치기' : '추가'}</span><button type="button" class="icon-btn" data-close aria-label="닫기">✕</button></div>
      <div class="hrow2"><label class="hf"><span>날짜</span><input id="v-date" type="date" value="${esc(d.date)}"></label><label class="hf"><span>병원</span><input id="v-place" maxlength="200" value="${esc(d.place)}" placeholder="예: 정형외과" autocomplete="off"></label></div>
      <label class="hf"><span>사유</span><input id="v-why" maxlength="2000" value="${esc(d.why)}" placeholder="왜 갔는지" autocomplete="off"></label>
      <label class="hf"><span>경과</span><input id="v-result" maxlength="2000" value="${esc(d.result)}" placeholder="결과 · 처방 · 다음에 할 것" autocomplete="off"></label>
      <div class="hdlg-f">
        ${d.id ? `<button type="button" class="linkbtn danger" data-del>${d.confirmDel ? '한 번 더 누르면 삭제' : '지우기'}</button>` : '<span></span>'}
        <span class="msg" role="status">${esc(d.msg || '')}</span>
        <button type="button" class="btn" data-save${d.busy ? ' disabled' : ''}>${d.busy ? '저장 중…' : '저장'}</button>
      </div>
    </div></div>`;
}

// ── 증상 모아보기 ──
function tagData(st) {
  const counts = {};
  for (const c of Object.values(st.conds)) for (const t of c.tags) counts[t] = (counts[t] || 0) + 1;
  const names = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  if (!names.includes(selTag)) selTag = names[0] || null;
  const items = selTag ? Object.values(st.conds).filter((c) => c.tags.includes(selTag)).sort((a, b) => b.date.localeCompare(a.date)) : [];
  return { counts, names, items };
}
function nearVisit(st, date) {
  const t = Date.parse(date);
  return st.visits.find((v) => Math.abs(Date.parse(v.date) - t) <= 3 * 86400000);
}
function tagsTop(st, td) {
  if (!td.names.length) return `<p class="muted hl-empty">${st.loaded ? `${st.y}년에 남긴 증상이 아직 없어요.<br>컨디션을 남길 때 #증상을 눌러 두면 여기 모여요` : '불러오는 중…'}</p>`;
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const dots = td.items.filter((c) => Number(c.date.slice(5, 7)) === m).map((c) => {
      const top = Math.round(((Number(c.date.slice(8)) - 1) / 30) * 42 + 2);
      return `<i title="${md(c.date)}" style="top:${top}px;background:${lvColor(c.level)}"></i>`;
    }).join('');
    months.push(`<div class="ty-m">${dots}</div>`);
  }
  const last = td.items[0];
  return `<div class="mk-filters">${td.names.map((n) => `<button type="button" class="fchip" data-pick="${esc(n)}" aria-selected="${n === selTag}">#${esc(n)} <small>${td.counts[n]}</small></button>`).join('')}</div>
    <div class="ty-sum"><span class="head">#${esc(selTag)}</span><span>${st.y}년 <b>${td.items.length}번</b>${last ? ` · 마지막 ${md(last.date)}` : ''}</span></div>
    <div class="ty"><div class="ty-row">${months.join('')}</div><div class="ty-lb">${Array.from({ length: 12 }, (_, i) => `<span>${i + 1}월</span>`).join('')}</div>
    <small class="muted">칸 안의 위치 = 그 달의 며칠쯤 · 색 = 그날 컨디션</small></div>`;
}
function tagsList(st, td) {
  return td.items.map((c) => {
    const v = nearVisit(st, c.date);
    return `<a class="hr-row" href="#/health/${c.date.slice(0, 7)}" data-jump="${c.date}"><span class="d">${md(c.date)}</span><i style="background:${lvColor(c.level)}"></i><span class="lv">${esc(c.level || '—')}</span><span class="nt">${esc(c.note || '—')}</span>${v ? `<span class="vbadge">${PLUS}${md(v.date)} ${esc(v.place)}</span>` : ''}</a>`;
  }).join('');
}
function yearNav(st) {
  return `<span class="yr-nav"><a class="icon-btn sm" href="#/health/tags/${st.y - 1}" aria-label="지난해">${ARROW_L}</a>${st.y}<a class="icon-btn sm" href="#/health/tags/${st.y + 1}" aria-label="다음 해">${ARROW_R}</a></span>`;
}

function segHtml(active) {
  return `<div class="seg seg3" role="tablist">
    <a role="tab" href="#/health" aria-selected="${active === 'month'}">컨디션</a>
    <a role="tab" href="#/health/visits" aria-selected="${active === 'visits'}">진료기록</a>
    <a role="tab" href="#/health/tags" aria-selected="${active === 'tags'}">증상</a></div>`;
}

function spreadHtml(st) {
  if (st.view === 'tags') {
    const td = tagData(st);
    return `<div class="page left"><div class="rd">
      <header class="rd-head"><span class="t"><span class="head">증상 모아보기</span><span class="cnt">${yearNav(st)}</span></span><a class="go-now" href="#/health">← 컨디션</a></header>
      ${tagsTop(st, td)}</div></div>
      <div class="page right"><div class="rd"><header class="rd-head"><span class="muted" style="font-size:13px">진료기록에 같은 무렵(±3일) 기록이 있으면 함께 보여요</span></header>
      <div class="hr-list scroll">${tagsList(st, td)}</div></div></div>`;
  }
  return `<div class="page left"><div class="rd hl-gap">
      ${monthHead(st)}
      ${editBox(st)}
      <div class="hc-h"><span class="head">이달의 흐름</span><a class="go-now" href="#/health/tags">증상 모아보기 ›</a></div>
      ${calHtml(st)}
      <div class="hr-list">${recentHtml(st, 4)}</div>
    </div></div>
    <div class="page right"><div class="rd">
      <header class="rd-head"><span class="t"><span class="head">진료기록</span><span class="cnt">${st.y}</span></span><button type="button" class="pill" data-addvisit>${PLUS}기록 추가</button></header>
      ${visitTable(st)}
    </div></div>
    ${visitDialog(st)}`;
}

function singleHtml(st) {
  if (st.view === 'tags') {
    const td = tagData(st);
    return `<header class="sw-head"><span style="width:44px"></span><span class="ttl"><small>증상 모아보기</small><span class="head">건강</span></span><span style="width:44px"></span></header>
      ${segHtml('tags')}<div class="rs-body"><div class="rs-cap">${yearNav(st)}</div>${tagsTop(st, td)}<div class="hr-list">${tagsList(st, td)}</div></div>`;
  }
  if (st.view === 'visits') {
    return `<header class="sw-head"><span style="width:44px"></span><span class="ttl"><small>${st.y}</small><span class="head">건강</span></span><button type="button" class="icon-btn" data-addvisit aria-label="진료기록 추가">${PLUS}</button></header>
      ${segHtml('visits')}<div class="rs-body">${visitCards(st)}</div>${visitDialog(st)}`;
  }
  return `${monthHead(st, true)}${segHtml('month')}
    <div class="rs-body">${editBox(st)}${calHtml(st)}<div class="hr-list">${recentHtml(st, 10)}</div></div>`;
}

export async function renderHealth(el, ctx) {
  const tp = todayParts();
  const today = todayKey();
  const parts = (location.hash.replace(/^#\/?/, '').split('/'));
  let view = 'month', y = tp.y, m = tp.m;
  if (parts[1] === 'tags') { view = 'tags'; if (/^\d{4}$/.test(parts[2] || '')) y = Number(parts[2]); }
  else if (parts[1] === 'visits') { view = ctx.mode === 'spread' ? 'month' : 'visits'; }
  else if (/^\d{4}-\d{2}$/.test(parts[1] || '')) { y = Number(parts[1].slice(0, 4)); m = Number(parts[1].slice(5)); }
  const inMonth = today.startsWith(ym(y, m));
  const jump = sessionStorage.getItem?.('health-jump');
  sessionStorage.removeItem?.('health-jump');
  const st = {
    view, y, m, today, sel: jump && jump.startsWith(ym(y, m)) ? jump : (inMonth ? today : null),
    conds: {}, visits: [], tags: [], loaded: false, configured: true, status: '', dlg: null, addingTag: false,
  };
  const paint = () => {
    el.innerHTML = ctx.mode === 'spread' ? spreadHtml(st) : singleHtml(st);
    const ni = el.querySelector('#h-note');
    if (ni) {
      // 글이 길어지면 칸이 아래로 늘어남 (줄바꿈 Enter 가능)
      const grow = () => { ni.style.height = 'auto'; ni.style.height = `${ni.scrollHeight}px`; };
      grow();
      ni.addEventListener('input', () => {
        grow();
        const c = st.conds[st.sel] || (st.conds[st.sel] = { date: st.sel, level: '', note: '', tags: [] });
        c.note = ni.value; schedule(st, st.sel, 900); st.repaintStatus();
      });
    }
    const nt = el.querySelector('#h-newtag');
    if (nt) {
      nt.focus();
      const done = () => {
        const v = nt.value.trim().replace(/^#/, '');
        st.addingTag = false;
        if (v) { const c = st.conds[st.sel] || (st.conds[st.sel] = { date: st.sel, level: '', note: '', tags: [] }); if (!c.tags.includes(v)) c.tags.push(v); if (!st.tags.includes(v)) st.tags.push(v); schedule(st, st.sel, 0); }
        paint();
      };
      nt.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); done(); } if (e.key === 'Escape') { st.addingTag = false; paint(); } });
      nt.addEventListener('blur', done, { once: true });
    }
  };
  st.repaintStatus = () => { const s = el.querySelector('#h-status'); if (s && ctx.isCurrent()) s.textContent = st.status; };
  st.repaintDots = () => {
    if (!ctx.isCurrent()) return;
    const cal = el.querySelector('.hc-cal'); if (cal) cal.outerHTML = calHtml(st);
    const rl = el.querySelector('.hr-list'); if (rl && st.view === 'month') rl.innerHTML = recentHtml(st, ctx.mode === 'spread' ? 4 : 10);
    const clr = el.querySelector('.hb-top'); if (clr && st.sel) { const has = !!st.conds[st.sel]; const b = clr.querySelector('[data-clear]'); if (has && !b) clr.insertAdjacentHTML('beforeend', '<button type="button" class="linkbtn" data-clear>지우기</button>'); if (!has && b) b.remove(); }
  };
  paint();

  const data = await getHealth(y);
  if (!ctx.isCurrent()) return;
  for (const c of data.conditions || []) st.conds[c.date] = c;
  Object.assign(st, { visits: data.visits || [], tags: data.tags || [], configured: data.configured !== false, loaded: true });
  if (data.error) st.status = `불러오지 못했어요 (${errText(data.error)})`;
  paint();

  const cond = () => st.conds[st.sel] || (st.conds[st.sel] = { date: st.sel, level: '', note: '', tags: [] });

  el.onclick = async (ev) => {
    const t = ev.target;
    if (st.dlg) {
      const d = st.dlg;
      const read = () => Object.assign(d, { date: el.querySelector('#v-date').value, place: el.querySelector('#v-place').value, why: el.querySelector('#v-why').value, result: el.querySelector('#v-result').value });
      const closeBtn = t.closest('[data-close]');
      if (closeBtn && (closeBtn.classList.contains('dlg-back') ? t === closeBtn : true)) { st.dlg = null; paint(); return; }
      if (t.closest('[data-save]') && !d.busy) {
        read();
        if (!d.place.trim() || !d.date) { d.msg = '날짜와 병원을 써 주세요'; paint(); return; }
        d.busy = true; d.msg = ''; paint();
        const r = await healthAction({ kind: 'visit', action: d.id ? 'update' : 'add', id: d.id, date: d.date, place: d.place, why: d.why, result: d.result });
        if (!r.ok) { d.busy = false; d.msg = errText(r.error); paint(); return; }
        const others = st.visits.filter((v) => v.id !== d.id);
        st.visits = r.visit.date.startsWith(String(st.y)) ? [r.visit, ...others] : others;
        st.visits.sort((a, b) => b.date.localeCompare(a.date));
        st.dlg = null; paint(); return;
      }
      if (t.closest('[data-del]') && !d.busy) {
        read();
        if (!d.confirmDel) { d.confirmDel = true; paint(); return; }
        d.busy = true; paint();
        const r = await healthAction({ kind: 'visit', action: 'delete', id: d.id });
        if (!r.ok) { d.busy = false; d.msg = errText(r.error); paint(); return; }
        st.visits = st.visits.filter((v) => v.id !== d.id);
        st.dlg = null; paint();
      }
      return;
    }
    if (t.closest('[data-addvisit]')) { if (st.configured) { st.dlg = { date: today, place: '', why: '', result: '' }; paint(); el.querySelector('#v-place')?.focus(); } return; }
    const vr = t.closest('[data-visit]');
    if (vr) { const v = st.visits.find((x) => x.id === vr.dataset.visit); if (v) { st.dlg = { ...v }; paint(); } return; }
    const pick = t.closest('[data-pick]');
    if (pick) { selTag = pick.dataset.pick; paint(); return; }
    const jumpA = t.closest('[data-jump]');
    if (jumpA) { try { sessionStorage.setItem('health-jump', jumpA.dataset.jump); } catch { /* 무시 */ } return; }
    const day = t.closest('[data-day]');
    if (day && !day.disabled) { if (pending) await flush(); st.sel = day.dataset.day; st.status = ''; st.addingTag = false; paint(); return; }
    if (!st.configured || !st.sel) return;
    const lv = t.closest('[data-level]');
    if (lv) { const c = cond(); c.level = c.level === lv.dataset.level ? '' : lv.dataset.level; schedule(st, st.sel, 0); paint(); return; }
    const tg = t.closest('[data-tag]');
    if (tg) { const c = cond(); const n = tg.dataset.tag; c.tags = c.tags.includes(n) ? c.tags.filter((x) => x !== n) : [...c.tags, n]; schedule(st, st.sel, 0); paint(); return; }
    if (t.closest('[data-newtag]')) { st.addingTag = true; paint(); return; }
    if (t.closest('[data-clear]')) { st.conds[st.sel] = { date: st.sel, level: '', note: '', tags: [] }; schedule(st, st.sel, 0); paint(); }
  };
  el.onkeydown = (ev) => { if (ev.key === 'Escape' && st.dlg) { st.dlg = null; paint(); } };
}

window.addEventListener('hashchange', () => { flush(); });
window.addEventListener('pagehide', () => { flush(); });
