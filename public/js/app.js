// 화면 전환, 창 크기에 따른 배치(펼친 두 면 ↔ 한 면), 인덱스 탭
import { renderCover } from './views/cover.js';
import { renderMonth } from './views/month.js';
import { renderWeek } from './views/week.js';
import { renderHabit } from './views/habit.js';
import { renderQt } from './views/qt.js';
import { renderBooks, renderMarks } from './views/reading.js';
import { renderHealth } from './views/health.js';
import { renderNotes } from './views/notes.js';
import { renderSoon, renderMore } from './views/soon.js';

const SPREAD_MIN_WIDTH = 900;   // 이보다 좁으면 한 면 보기
const BOOK_W = 1200 + 34;       // 책 + 인덱스 탭
const BOOK_H = 800;

const TABS = [
  ['month', '월간'], ['week', '주간'], ['habit', '습관'], ['qt', '큐티'],
  ['books', '완독'], ['marks', '책갈피'], ['notes', '노트'], ['health', '건강'],
];
const BOTTOM = [
  ['month', '월간', '<rect x="3" y="4" width="14" height="13" rx="2"/><path d="M3 8h14M7 2v4M13 2v4"/>'],
  ['week', '주간', '<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M10 3v14M3 10h14"/>'],
  ['qt', '큐티', '<path d="M5 4h10v13l-5-3-5 3z"/>'],
  ['books', '독서', '<path d="M3 4.5C5 3.5 8 3.5 10 5c2-1.5 5-1.5 7-.5V16c-2-1-5-1-7 .5C8 15 5 15 3 16z"/><path d="M10 5v11.5"/>'],
  ['more', '더보기', '<circle cx="5" cy="10" r="1.2"/><circle cx="10" cy="10" r="1.2"/><circle cx="15" cy="10" r="1.2"/>'],
];
const MORE_GROUP = new Set(['more', 'habit', 'notes', 'health']);
const READING_GROUP = new Set(['books', 'marks']);

const VIEWS = { cover: renderCover, month: renderMonth, week: renderWeek, habit: renderHabit, qt: renderQt, books: renderBooks, marks: renderMarks, health: renderHealth, notes: renderNotes, more: renderMore };

export function go(name, arg) {
  location.hash = `#/${name}${arg ? `/${arg}` : ''}`;
}

function parseRoute() {
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'cover', arg };
}

const currentMode = () => (window.innerWidth < SPREAD_MIN_WIDTH ? 'single' : 'spread');

function tabsHtml(active) {
  return `<nav class="tabs" aria-label="다이어리 목차">${TABS.map(([id, label]) =>
    `<a href="#/${id}"${id === active ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
}

function bottomHtml(active) {
  const isOn = (id) => id === active || (id === 'more' && MORE_GROUP.has(active)) || (id === 'books' && READING_GROUP.has(active));
  return `<nav class="bottombar" aria-label="다이어리 목차">${BOTTOM.map(([id, label, icon]) =>
    `<a href="#/${id}"${isOn(id) ? ' aria-current="page"' : ''}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${icon}</svg>${label}</a>`).join('')}</nav>`;
}

function fitBook() {
  const wrap = document.getElementById('bookwrap');
  const book = document.getElementById('book');
  if (!wrap || !book) return;
  const s = Math.max(0.62, Math.min(1, (window.innerWidth - 96) / BOOK_W, (window.innerHeight - 80) / BOOK_H));
  book.style.transform = `scale(${s})`;
  wrap.style.width = `${BOOK_W * s}px`;
  wrap.style.height = `${BOOK_H * s}px`;
}

let mode = null;
let renderId = 0;

async function render() {
  const id = ++renderId;
  mode = currentMode();
  document.body.dataset.mode = mode;
  const { name, arg } = parseRoute();
  const root = document.getElementById('app');
  const view = VIEWS[name] || renderSoon;

  if (name === 'cover') {
    root.innerHTML = '<div class="desk cover-desk"><div id="view"></div></div>';
  } else if (mode === 'spread') {
    root.innerHTML = `<div class="desk"><div class="book-wrap" id="bookwrap"><div class="book" id="book">
      <a class="to-cover" href="#/cover">← 표지</a><div id="view" class="spread" data-view="${name}"></div>${tabsHtml(name)}</div></div></div>`;
    fitBook();
  } else {
    root.innerHTML = `<div class="phone"><div id="view" class="single"></div>${bottomHtml(name)}</div>`;
  }
  await view(document.getElementById('view'), { mode, arg, name, go, isCurrent: () => id === renderId });
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => (currentMode() !== mode ? render() : fitBook()), 120);
});
window.addEventListener('hashchange', render);
render();
