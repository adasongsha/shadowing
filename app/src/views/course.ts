// Day 列表：每天显示进度（已练句数 / 总句数）。
import { getCourse, progressMap, skey } from '../db';
import { enc } from '../nav';
import { h, iconEl } from '../ui';
import { progressBar } from './library';

export async function courseView(root: HTMLElement, [courseId]: string[]) {
  const course = await getCourse(courseId);
  if (!course) {
    location.hash = '#/';
    return;
  }
  const prog = await progressMap(courseId);

  const rows = course.days.map((d) => {
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
    return h(
      'a',
      { class: 'row card', href: `#/c/${enc(courseId)}/d/${d.day}` },
      h(
        'div',
        { class: 'row-main' },
        h('div', { class: 'row-title' }, d.title),
        h(
          'div',
          { class: 'row-sub' },
          `已练 ${practiced}/${total}`,
          done ? ` · ✅ ${done}` : '',
          star ? ` · ⭐ ${star}` : '',
        ),
        progressBar(practiced, total),
      ),
      iconEl('chevron'),
    );
  });

  root.append(
    h(
      'header',
      { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#/', 'aria-label': '返回' }, iconEl('back')),
      h('h1', null, course.title),
      h('span', { class: 'icon-btn-spacer' }),
    ),
    h('main', { class: 'content' }, h('div', { class: 'list' }, rows)),
  );
}
