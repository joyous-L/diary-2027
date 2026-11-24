import { todayParts, ym } from '../util.js';

export function renderCover(el) {
  const t = todayParts();
  const start = ym(t.y, t.m); // 지금부터 미리 써 보기: 항상 이번 달로
  el.innerHTML = `
    <div class="cover" role="img" aria-label="MY DIARY 2027 표지">
      <div class="year" aria-hidden="true"><span>20</span><span>27</span></div>
      <div class="band">
        <span class="y">2027</span>
        <span class="rule"></span>
        <span class="t">MY DIARY</span>
        <span class="s">little notes, long memories</span>
      </div>
      <a class="open" href="#/month/${start}">펼치기</a>
    </div>`;
}
