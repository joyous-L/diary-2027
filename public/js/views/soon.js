const NAMES = { week: '주간', habit: '습관', qt: '큐티', books: '완독', marks: '책갈피', notes: '노트', health: '건강' };

export function renderSoon(el, { mode, name }) {
  const title = NAMES[name] || '페이지';
  const body = `<div class="soon"><span class="head">${title}</span><span class="muted">곧 만들어요</span></div>`;
  el.innerHTML = mode === 'spread'
    ? `<div class="page left">${body}</div><div class="page right"></div>`
    : body;
}

export function renderMore(el, { mode }) {
  const list = `<div class="more-list">
    <a href="#/habit">습관</a><a href="#/notes">노트</a><a href="#/health">건강</a><a href="#/marks">책갈피</a><a href="#/cover">표지 보기</a>
  </div>`;
  el.innerHTML = mode === 'spread' ? `<div class="page left">${list}</div><div class="page right"></div>` : list;
}
