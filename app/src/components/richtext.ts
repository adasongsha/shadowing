// 英文句子渲染：每个单词可点（查词），按 hints 标出连读 / 弱读 / 闪音 / 省略。
// 提示的显示由外层的 .show-hints 类控制，关掉时句子就是普通文本。
import type { Hint } from '../db';
import { h } from '../ui';

const WORD = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

export interface WordTap {
  word: string;
  /** 和这个词有关的提示 */
  hints: Hint[];
}

export function renderSentence(text: string, hints: Hint[] = [], onWord?: (t: WordTap) => void) {
  // 每个字符的样式类
  const cls: Set<string>[] = Array.from(text, () => new Set());
  const linkGaps = new Set<number>(); // 在这些空白字符上画连读弧线
  for (const ht of hints) {
    if (ht.from < 0 || ht.to > text.length) continue;
    if (ht.type === 'link') {
      cls[ht.from]?.add('h-link');
      cls[ht.to - 1]?.add('h-link');
      for (let i = ht.from + 1; i < ht.to - 1; i++) if (/\s/.test(text[i])) linkGaps.add(i);
    } else {
      for (let i = ht.from; i < ht.to; i++) cls[i].add(`h-${ht.type}`);
    }
  }

  const root = h('span', { class: 'rich' });
  const pushRun = (parent: HTMLElement, start: number, end: number) => {
    let i = start;
    while (i < end) {
      if (linkGaps.has(i)) {
        parent.append(h('span', { class: 'lk' }, text[i]));
        i++;
        continue;
      }
      const key = [...cls[i]].sort().join(' ');
      let j = i + 1;
      while (j < end && !linkGaps.has(j) && [...cls[j]].sort().join(' ') === key) j++;
      const s = text.slice(i, j);
      parent.append(key ? h('span', { class: key }, s) : document.createTextNode(s));
      i = j;
    }
  };

  let last = 0;
  for (const m of text.matchAll(WORD)) {
    const s = m.index!;
    const e = s + m[0].length;
    pushRun(root, last, s);
    const w = h('span', { class: 'w', 'data-s': s, 'data-e': e });
    pushRun(w, s, e);
    root.append(w);
    last = e;
  }
  pushRun(root, last, text.length);

  if (onWord) {
    root.addEventListener('click', (ev) => {
      const w = (ev.target as HTMLElement).closest('.w') as HTMLElement | null;
      if (!w) return;
      const s = Number(w.dataset.s);
      const e = Number(w.dataset.e);
      // 连读提示的 to 指向下一个词的第一个字母之后，所以按区间相交来找
      const related = hints.filter((x) => x.from < e && x.to > s);
      onWord({ word: text.slice(s, e), hints: related });
    });
  }
  return root;
}

export const HINT_LABEL: Record<Hint['type'], string> = {
  stress: '重读',
  link: '连读',
  weak: '弱读',
  flap: '闪音',
  elide: '省略',
};

/** 图例：说明每种标记长什么样 */
export function hintLegend(hints: Hint[] = []) {
  const types = new Set(hints.map((x) => x.type));
  const item = (t: Hint['type'], sample: Node) => types.has(t) && h('span', { class: 'lg' }, sample, HINT_LABEL[t]);
  return h(
    'p',
    { class: 'hint-legend' },
    item('stress', h('b', { class: 'h-stress' }, 'Aa')),
    item('link', h('span', { class: 'lg-link' }, '‿')),
    item('weak', h('span', { class: 'h-weak' }, 'a')),
    item('flap', h('span', { class: 'h-flap' }, 't')),
    item('elide', h('span', { class: 'h-elide' }, 't')),
  );
}
