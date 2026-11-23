// 英文句子渲染：每个单词可点（查词），按 hints 标出重读 / 连读 / 弱读 / 闪音 / 省略。
// 标记是否显示由外层的 .marks-on 类控制，关掉时句子就是普通文本。
import type { Hint } from '../db';
import { h } from '../ui';

const WORD = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

export interface WordTap {
  word: string;
  /** 和这个词有关的提示 */
  hints: Hint[];
}

export const HINT_LABEL: Record<Hint['type'], string> = {
  stress: '重读',
  link: '连读',
  weak: '弱读',
  flap: '闪音',
  elide: '省略',
};

/**
 * @param numbers 在第 i 个词之后加上标编号（讲解页用）：Map<词序号, 编号>
 */
export function renderSentence(text: string, hints: Hint[] = [], onWord?: (t: WordTap) => void, numbers?: Map<number, number>) {
  const cls: Set<string>[] = Array.from(text, () => new Set());
  const linkGaps = new Set<number>(); // 在这些空白上画连读弧线
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
  let wi = 0;
  for (const m of text.matchAll(WORD)) {
    const s = m.index!;
    const e = s + m[0].length;
    pushRun(root, last, s);
    const w = h('span', { class: 'w', 'data-s': s, 'data-e': e });
    pushRun(w, s, e);
    root.append(w);
    const n = numbers?.get(wi);
    if (n) root.append(h('sup', { class: 'n' }, n));
    last = e;
    wi++;
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

/** 图例：只列出这句里出现的标记 */
export function hintLegend(hints: Hint[] = []) {
  const types = new Set(hints.map((x) => x.type));
  const item = (t: Hint['type'], sample: string) =>
    types.has(t) && h('li', null, h('span', { class: `s ${t}` }, sample), HINT_LABEL[t]);
  return h(
    'ul',
    { class: 'legend', 'aria-label': '标记说明' },
    item('stress', 'Aa'),
    item('link', '‿'),
    item('weak', 'a'),
    item('flap', 't'),
    item('elide', 't'),
    h('li', null, '点单词查词'),
  );
}

export interface Change {
  n: number;
  snippet: string;
  kinds: Hint['type'][];
  /** 每种现象一条说明（同类去重） */
  items: Hint[];
  /** 编号标在第几个词之后 */
  afterWord: number;
}

/**
 * 讲解页「于是发音这样变」：把相互重叠的提示（按整词扩展后）合成一条。
 * 例如 get a 上的闪音 + 连读 + 弱读合为一条「get a」。重读不列入（单独讲）。
 */
export function changeList(text: string, hints: Hint[] = []): Change[] {
  const words = [...text.matchAll(WORD)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const wordAt = (pos: number) => {
    const i = words.findIndex(([s, e]) => pos >= s && pos < e);
    if (i >= 0) return i;
    return words.findIndex(([s]) => s > pos); // 落在空白上：取后面一个词
  };
  const spans = hints
    .filter((x) => x.type !== 'stress')
    .map((x) => ({ a: wordAt(x.from), b: wordAt(Math.max(x.from, x.to - 1)), hint: x }))
    .filter((x) => x.a >= 0 && x.b >= 0)
    .sort((p, q) => p.a - q.a || p.b - q.b);
  const groups: { a: number; b: number; hints: Hint[] }[] = [];
  for (const sp of spans) {
    const g = groups[groups.length - 1];
    if (g && sp.a <= g.b) {
      g.b = Math.max(g.b, sp.b);
      g.hints.push(sp.hint);
    } else groups.push({ a: sp.a, b: sp.b, hints: [sp.hint] });
  }
  return groups.map((g, i) => ({
    n: i + 1,
    snippet: text.slice(words[g.a][0], words[g.b][1]),
    kinds: [...new Set(g.hints.map((x) => x.type))],
    items: g.hints.filter((x, j, a) => a.findIndex((y) => y.type === x.type && y.note === x.note) === j),
    afterWord: g.b,
  }));
}
