// 组讲解页（原型 A-Group）：章节式标题、「是什么 / 为什么 / 怎么练」、编号句子列表。
import type { DayIntro } from '../db';
import { getCourse, progressMap, skey } from '../db';
import { enc } from '../nav';
import { settings } from '../settings';
import { h, iconEl } from '../ui';

const SECTIONS: [keyof DayIntro, string][] = [
  ['what', '是什么'],
  ['why', '为什么'],
  ['how', '怎么练'],
];

/** 本组讲解：默认只显示「是什么」，点「读完整讲解」展开「为什么 / 怎么练」 */
export function introBlock(intro?: DayIntro, collapsed = true) {
  const rows = SECTIONS.filter(([k]) => intro?.[k]);
  if (!intro || !rows.length) return null;
  const sec = h(
    'section',
    { class: `intro${collapsed && rows.length > 1 ? ' clamped' : ''}`, 'aria-label': '本组讲解' },
    rows.map(([k, label]) => h('div', { class: 'intro-row' }, h('h2', null, label), h('p', null, intro[k]!))),
  );
  if (collapsed && rows.length > 1) {
    const more = h(
      'button',
      { class: 'intro-more', type: 'button', 'aria-expanded': 'false', onclick: () => (sec.classList.remove('clamped'), more.remove()) },
      `读完整讲解：${rows.slice(1).map(([, l]) => l).join(' · ')}`,
    );
    sec.append(more);
  }
  return sec;
}

export async function dayView(root: HTMLElement, [courseId, dayStr]: string[]) {
  const course = await getCourse(courseId);
  const day = course?.days.find((d) => d.day === Number(dayStr));
  if (!course || !day) {
    location.hash = `#/c/${enc(courseId)}`;
    return;
  }
  const prog = await progressMap(courseId);
  const mode = settings.get().textMode;
  const last = settings.get().last;
  const lastIdx = last?.courseId === courseId && last.day === day.day ? last.idx : -1;
  const base = `#/c/${enc(courseId)}/d/${day.day}`;

  // 标题拆成「闪音」+「元音之间的 t」两部分
  const [main, sub] = day.title.split(/[：:]/);
  const firstTodo = Math.max(
    0,
    lastIdx >= 0 ? lastIdx : day.sentences.findIndex((s) => !prog.get(skey(courseId, s.id))?.practiced),
  );

  const rows = day.sentences.map((s, i) => {
    const p = prog.get(skey(courseId, s.id));
    const state = p?.mark === 'done' ? 'done' : i === lastIdx ? 'now' : '';
    return h(
      'a',
      { class: 'row sent-row', href: `${base}/${i}` },
      h('span', { class: `num ${state}` }, p?.mark === 'done' ? '✓' : i + 1),
      h(
        'span',
        { class: 'row-main' },
        h('span', { class: 'en', lang: 'en', style: mode === 'none' ? { filter: 'blur(0.4em)' } : undefined }, s.text),
        s.zh && h('span', { class: 'zh', style: mode !== 'all' ? { filter: 'blur(0.35em)' } : undefined }, s.zh),
      ),
      p?.mark === 'star'
        ? h('span', { class: 'state', style: { color: 'var(--star)' } }, '需加强')
        : i === lastIdx
          ? h('span', { class: 'state' }, '在练')
          : p?.practiced
            ? h('span', { class: 'state', style: { color: 'var(--muted)' } }, '已练')
            : null,
    );
  });

  root.append(
    h(
      'header',
      { class: 'topbar' },
      h('a', { class: 'icon-btn', href: `#/c/${enc(courseId)}`, 'aria-label': '返回' }, iconEl('back')),
      h('div', { class: 'topbar-title' }, h('span', null, `${course.title} · 第 ${course.days.indexOf(day) + 1} 组`)),
      h('span', { class: 'icon-btn-spacer' }),
    ),
    h(
      'main',
      { class: 'content' },
      h('div', { class: 'chapter' }, h('h1', null, main), sub && h('span', { class: 'muted', style: { fontSize: '17px' } }, sub.trim())),
      introBlock(day.intro),
      h('div', { class: 'list' }, rows),
      h(
        'div',
        { class: 'sticky-foot' },
        h('a', { class: 'btn ink block', href: `${base}/${firstTodo}` }, firstTodo > 0 ? `从第 ${firstTodo + 1} 句继续` : '从第 1 句开始'),
      ),
    ),
  );
}
