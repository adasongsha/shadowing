// 讲解卡片：一组的「是什么 / 为什么会这样 / 怎么练」，以及一句的讲解。
import type { DayIntro } from '../db';
import { h } from '../ui';

const SECTIONS: [keyof DayIntro, string][] = [
  ['what', '是什么'],
  ['why', '为什么会这样'],
  ['how', '怎么练'],
];

export function hasIntro(intro?: DayIntro) {
  return !!intro && SECTIONS.some(([k]) => intro[k]);
}

/** 一组的讲解。open：默认展开 */
export function introCard(intro: DayIntro, summary: string, open: boolean, onToggle?: (open: boolean) => void) {
  const d = h(
    'details',
    { class: 'card explain intro', open },
    h('summary', null, summary),
    h(
      'div',
      { class: 'explain-body' },
      SECTIONS.filter(([k]) => intro[k]).map(([k, label]) =>
        h('section', null, h('h3', null, label), h('p', null, intro[k]!)),
      ),
    ),
  );
  if (onToggle) d.addEventListener('toggle', () => onToggle(d.open));
  return d;
}

/** 一句的讲解 */
export function noteCard(note: string, open: boolean, onToggle?: (open: boolean) => void) {
  const d = h(
    'details',
    { class: 'card explain note', open },
    h('summary', null, '这句话为什么这样读'),
    h('div', { class: 'explain-body' }, h('p', null, note)),
  );
  if (onToggle) d.addEventListener('toggle', () => onToggle(d.open));
  return d;
}
