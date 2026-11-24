// 구글 캘린더 비공개 주소(iCal)를 읽어 기간 안의 일정을 펼쳐 주는 작은 파서.
// 모든 시각은 한국 시간(KST) "벽시계" 기준 밀리초로 다룬다 (Date.UTC로 만들되 KST 숫자 그대로).

const DAY = 86400000;
const KST_OFFSET = 9 * 3600000;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function unescapeText(v) {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function parseLine(line) {
  const colon = line.indexOf(':');
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = head.split(';');
  const name = parts[0].toUpperCase();
  const params = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name, params, value };
}

// 날짜 값 → { ms (KST 벽시계), allDay }
export function parseDate(value, params = {}) {
  const v = value.trim();
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(v)) {
    const y = +v.slice(0, 4), m = +v.slice(4, 6), d = +v.slice(6, 8);
    return { ms: Date.UTC(y, m - 1, d), allDay: true };
  }
  const mt = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!mt) return null;
  let ms = Date.UTC(+mt[1], +mt[2] - 1, +mt[3], +mt[4], +mt[5], +mt[6]);
  if (mt[7] === 'Z') ms += KST_OFFSET; // UTC → KST
  return { ms, allDay: false };
}

function parseRRule(v) {
  const r = {};
  for (const part of v.split(';')) {
    const [k, val] = part.split('=');
    if (k && val !== undefined) r[k.toUpperCase()] = val;
  }
  return {
    freq: r.FREQ,
    interval: Math.max(1, parseInt(r.INTERVAL || '1', 10)),
    count: r.COUNT ? parseInt(r.COUNT, 10) : null,
    until: r.UNTIL ? parseDate(r.UNTIL).ms : null,
    byday: r.BYDAY ? r.BYDAY.split(',') : null,
    bymonthday: r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null,
  };
}

export function parseICS(text) {
  const events = [];
  let cur = null;
  for (const raw of unfold(text)) {
    if (raw === 'BEGIN:VEVENT') { cur = { exdates: new Set() }; continue; }
    if (raw === 'END:VEVENT') { if (cur && cur.start) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const l = parseLine(raw);
    if (!l) continue;
    switch (l.name) {
      case 'UID': cur.uid = l.value; break;
      case 'SUMMARY': cur.title = unescapeText(l.value); break;
      case 'STATUS': cur.status = l.value.toUpperCase(); break;
      case 'DTSTART': { const d = parseDate(l.value, l.params); if (d) { cur.start = d.ms; cur.allDay = d.allDay; } break; }
      case 'DTEND': { const d = parseDate(l.value, l.params); if (d) cur.end = d.ms; break; }
      case 'RRULE': cur.rrule = parseRRule(l.value); break;
      case 'EXDATE': for (const x of l.value.split(',')) { const d = parseDate(x, l.params); if (d) cur.exdates.add(d.ms); } break;
      case 'RECURRENCE-ID': { const d = parseDate(l.value, l.params); if (d) cur.recurrenceId = d.ms; break; }
    }
  }
  for (const e of events) {
    if (e.end === undefined) e.end = e.allDay ? e.start + DAY : e.start;
  }
  return events;
}

// 반복 일정 펼치기 — 매일/매주(요일)/매월(날짜·n번째 요일)/매년
function* occurrences(e, rangeEnd) {
  const r = e.rrule;
  const dur = e.end - e.start;
  const timeOfDay = ((e.start % DAY) + DAY) % DAY;
  const startDay = e.start - timeOfDay;
  let n = 0;
  const done = (ms) => (r.until !== null && ms > r.until) || ms >= rangeEnd || (r.count !== null && n >= r.count);
  const sd = new Date(startDay);
  let guard = 0;

  if (r.freq === 'DAILY') {
    for (let d = startDay; guard++ < 5000; d += r.interval * DAY) {
      const s = d + timeOfDay;
      if (done(s)) return;
      n++;
      if (!e.exdates.has(s)) yield { start: s, end: s + dur };
    }
  } else if (r.freq === 'WEEKLY') {
    const days = (r.byday || [WEEKDAYS[sd.getUTCDay()]]).map((x) => WEEKDAYS.indexOf(x.slice(-2)));
    const order = [1, 2, 3, 4, 5, 6, 0]; // 월요일 시작
    const mondayIdx = (sd.getUTCDay() + 6) % 7;
    for (let wk = startDay - mondayIdx * DAY; guard++ < 2000; wk += r.interval * 7 * DAY) {
      for (const wd of order) {
        if (!days.includes(wd)) continue;
        const day = wk + ((wd + 6) % 7) * DAY;
        const s = day + timeOfDay;
        if (s < e.start) continue;
        if (done(s)) return;
        n++;
        if (!e.exdates.has(s)) yield { start: s, end: s + dur };
      }
    }
  } else if (r.freq === 'MONTHLY') {
    for (let k = 0; guard++ < 1200; k += r.interval) {
      const y = sd.getUTCFullYear(), m = sd.getUTCMonth() + k;
      const first = Date.UTC(y, m, 1);
      const len = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      let dayList = [];
      if (r.byday) {
        for (const bd of r.byday) {
          const mm = bd.match(/^([+-]?\d+)?([A-Z]{2})$/);
          if (!mm) continue;
          const wd = WEEKDAYS.indexOf(mm[2]);
          const all = [];
          for (let d = 1; d <= len; d++) if (new Date(first + (d - 1) * DAY).getUTCDay() === wd) all.push(d);
          if (mm[1]) { const i = parseInt(mm[1], 10); const pick = i > 0 ? all[i - 1] : all[all.length + i]; if (pick) dayList.push(pick); }
          else dayList.push(...all);
        }
      } else {
        dayList = (r.bymonthday || [sd.getUTCDate()]).map((d) => (d < 0 ? len + d + 1 : d)).filter((d) => d >= 1 && d <= len);
      }
      dayList.sort((a, b) => a - b);
      for (const d of dayList) {
        const s = first + (d - 1) * DAY + timeOfDay;
        if (s < e.start) continue;
        if (done(s)) return;
        n++;
        if (!e.exdates.has(s)) yield { start: s, end: s + dur };
      }
      if (first > rangeEnd) return;
    }
  } else if (r.freq === 'YEARLY') {
    for (let k = 0; guard++ < 200; k += r.interval) {
      const s = Date.UTC(sd.getUTCFullYear() + k, sd.getUTCMonth(), sd.getUTCDate()) + timeOfDay;
      if (done(s)) return;
      n++;
      if (!e.exdates.has(s)) yield { start: s, end: s + dur };
    }
  } else {
    yield { start: e.start, end: e.end };
  }
}

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const hm = (ms) => { const d = new Date(ms); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };

// rangeStart/End: 'YYYY-MM-DD' (끝은 포함 안 함). 결과: [{date, start, end, allDay, title}]
export function expandEvents(events, rangeStartStr, rangeEndStr) {
  const rs = Date.UTC(...rangeStartStr.split('-').map((v, i) => (i === 1 ? v - 1 : +v)));
  const re = Date.UTC(...rangeEndStr.split('-').map((v, i) => (i === 1 ? v - 1 : +v)));
  const overrides = new Map();
  for (const e of events) if (e.recurrenceId !== undefined) overrides.set(`${e.uid}|${e.recurrenceId}`, e);

  const out = [];
  const push = (e, s, en) => {
    if (e.status === 'CANCELLED') return;
    if (e.allDay) {
      for (let d = Math.max(s, rs); d < Math.min(en, re); d += DAY) {
        out.push({ date: dateKey(d), start: null, end: null, allDay: true, title: e.title || '' });
      }
    } else {
      if (s < rs || s >= re) return; // 시간 일정은 시작한 날에만 표시
      out.push({ date: dateKey(s), start: hm(s), end: hm(en), allDay: false, title: e.title || '' });
    }
  };

  for (const e of events) {
    if (e.recurrenceId !== undefined) { push(e, e.start, e.end); continue; }
    if (!e.rrule) { push(e, e.start, e.end); continue; }
    for (const o of occurrences(e, re)) {
      if (overrides.has(`${e.uid}|${o.start}`)) continue;
      if (o.end <= rs && o.start < rs) continue;
      push(e, o.start, o.end);
    }
  }
  out.sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')) || (a.allDay ? -1 : 1));
  return out;
}
