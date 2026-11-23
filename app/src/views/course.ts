// 课程的组列表：每组显示标题、进度。
import { getCourse, progressMap, skey } from '../db';
import { enc } from '../nav';
import { h, icon, iconEl } from '../ui';
import { progressBar } from './library';

export async function courseView(root: HTMLElement, [courseId]: string[]) {
  const course = await getCourse(courseId);
  if (!course) {
    location.hash = '#/sentences';
    return;
  }
  const prog = await progressMap(courseId);

  const rows = course.days.map((d, i) => {
    const total = d.sentences.length;
    let practiced = 0;
    let done = 0;
    let star = 0;
    for (const s of d.sentences) {
      const p = prog.get(skey(courseId, s.id));
      if (!p) continue;
      if (p.practiced > 0) practiced++;
      if (p.mark === 'done') done++;
      if (p.mark === 'star') star++;
    }
    const sub = [`已练 ${practiced}/${total}`, done && `已掌握 ${done}`, star && `需加强 ${star}`].filter(Boolean).join(' · ');
    return h(
      'a',
      { class: 'row', href: `#/c/${enc(courseId)}/d/${d.day}` },
      h('span', { class: 'path-sym', style: { fontSize: '17px', color: 'var(--muted)' } }, String(i + 1).padStart(2, '0')),
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, d.title), h('span', { class: 'row-sub' }, sub), progressBar(practiced, total)),
      h('span', { class: 'ic chev', html: icon.chevron }),
    );
  });

  root.append(
    h(
      'header',
      { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#/sentences', 'aria-label': '返回' }, iconEl('back')),
      h('div', { class: 'topbar-title' }, h('strong', null, course.title)),
      h('span', { class: 'icon-btn-spacer' }),
    ),
    h('main', { class: 'content' }, h('div', { class: 'list' }, rows)),
  );
}
