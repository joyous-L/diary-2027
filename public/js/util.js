// 날짜 계산과 공휴일 (월요일 시작, 한국 시간)
export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const ym = (y, m) => `${y}-${pad(m)}`;

export function todayParts() {
  const now = new Date(Date.now() + 9 * 3600000); // KST
  return { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1, d: now.getUTCDate() };
}
export const todayKey = () => { const t = todayParts(); return ymd(t.y, t.m, t.d); };

export function addMonths(y, m, k) {
  const t = (y * 12 + (m - 1)) + k;
  return { y: Math.floor(t / 12), m: (t % 12) + 1 };
}
export const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const monIndex = (y, m, d) => (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 월=0 … 일=6

// 한 달 칸 (앞뒤 달 날짜 포함, 월요일 시작). weeks: 5 또는 6
export function monthGrid(y, m) {
  const pad0 = monIndex(y, m, 1);
  const total = Math.ceil((pad0 + daysIn(y, m)) / 7) * 7;
  const cells = [];
  for (let i = 0; i < total; i++) {
    const dt = new Date(Date.UTC(y, m - 1, 1 - pad0 + i));
    const cy = dt.getUTCFullYear(), cm = dt.getUTCMonth() + 1, cd = dt.getUTCDate();
    cells.push({ y: cy, m: cm, d: cd, key: ymd(cy, cm, cd), inMonth: cm === m, dow: i % 7 });
  }
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// 우주항공청 2027년 월력요항 기준 (임시공휴일·선거일은 발표되면 추가)
export const HOLIDAYS = {
  '2026-12-25': '성탄절',
  '2027-01-01': '신정',
  '2027-02-06': '설날 연휴', '2027-02-07': '설날', '2027-02-08': '설날 연휴', '2027-02-09': '대체공휴일',
  '2027-03-01': '삼일절',
  '2027-05-01': '노동절', '2027-05-03': '대체공휴일',
  '2027-05-05': '어린이날',
  '2027-05-13': '부처님오신날',
  '2027-06-06': '현충일',
  '2027-07-17': '제헌절', '2027-07-19': '대체공휴일',
  '2027-08-15': '광복절', '2027-08-16': '대체공휴일',
  '2027-09-14': '추석 연휴', '2027-09-15': '추석', '2027-09-16': '추석 연휴',
  '2027-10-03': '개천절', '2027-10-04': '대체공휴일',
  '2027-10-09': '한글날', '2027-10-11': '대체공휴일',
  '2027-12-25': '성탄절', '2027-12-27': '대체공휴일',
  '2028-01-01': '신정',
};

export const MONTH_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
export const DOW_EN = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
export const DOW_KO = ['월', '화', '수', '목', '금', '토', '일'];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 일정 한 줄: 종일이면 제목만, 시작=끝이면 시각만, 아니면 시작~끝
export function eventLabel(e, withEnd = false) {
  if (e.allDay || !e.start) return e.title;
  if (!withEnd || e.start === e.end) return `${e.start} ${e.title}`;
  return `${e.start}~${e.end} ${e.title}`;
}

export function parseKey(key) { const [y, m, d] = key.split('-').map(Number); return { y, m, d }; }
export function addDaysKey(key, n) {
  const { y, m, d } = parseKey(key);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
export function weekStartOf(key) { const { y, m, d } = parseKey(key); return addDaysKey(key, -monIndex(y, m, d)); }

const ORD = ['첫째', '둘째', '셋째', '넷째', '다섯째'];
// 그 주의 목요일이 속한 달 기준으로 "1월 첫째 주"
export function weekTitle(startKey) {
  const thu = parseKey(addDaysKey(startKey, 3));
  return { y: thu.y, label: `${thu.m}월 ${ORD[Math.floor((thu.d - 1) / 7)]} 주` };
}
export const DOW_EN_LOWER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const CAT_COLOR = { '자기계발': '#4A6A8A', '건강관리': '#3E5C4A', '생활': '#A07A3A', '마음': '#A0566A' };

// 날짜를 동그란 알약 모양으로 (오늘 = 초록으로 채움, 일요일·공휴일 = 빨강)
export function datePill(label, en, { red = false, today = false, size = '' } = {}) {
  const cls = ['dpill', red && 'red', today && 'today', size].filter(Boolean).join(' ');
  return `<span class="${cls}"><b>${label}</b>${en ? `<small>${en}</small>` : ''}</span>`;
}

// 습관 요일: days = [0(월)…6(일)], 비어 있으면 매일
export function isDue(h, key) {
  if (!h?.days?.length) return true;
  const [y, m, d] = key.split('-').map(Number);
  return h.days.includes(monIndex(y, m, d));
}
export function dayLabel(days) {
  const s = (days || []).join('');
  if (!s || s === '0123456') return '매일';
  if (s === '01234') return '평일';
  if (s === '56') return '주말';
  return days.map((i) => DOW_KO[i]).join('·');
}
