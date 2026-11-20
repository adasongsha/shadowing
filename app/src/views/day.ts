// 句子列表：点一句进入练习页。
import { getCourse, progressMap, skey } from '../db';
import { enc } from '../nav';
import { settings } from '../settings';
import { h, iconEl } from '../ui';

export async function dayView(root: HTMLElement, [courseId, dayStr]: string[]) {
  const course = await getCourse(courseId);
  const day = course?.days.find((d) => d.day === Number(dayStr));
  if (!course || !day) {
    location.hash = `#/c/${enc(courseId)}`;
    return;
  }
  const prog = await progressMap(courseId);
  const hide = settings.get().hideText;

  const rows = day.sentences.map((s, i) => {
    const p = prog.get(skey(courseId, s.id));
    const badge = p?.mark === 'done' ? '✅' : p?.mark === 'star' ? '⭐' : p?.practiced ? '●' : '';
    return h(
      'a',
      { class: 'row sentence-row', href: `#/c/${enc(courseId)}/d/${day.day}/${i}` },
      h('span', { class: 'num' }, i + 1),
      h('span', { class: `row-text${hide ? ' blurred' : ''}` }, s.text),
      h('span', { class: `badge${badge === '●' ? ' dot' : ''}` }, badge),
    );
  });

  root.append(
    h(
      'header',
      { class: 'topbar' },
      h('a', { class: 'icon-btn', href: `#/c/${enc(courseId)}`, 'aria-label': '返回' }, iconEl('back')),
      h('h1', null, day.title),
      h('span', { class: 'icon-btn-spacer' }),
    ),
    h(
      'main',
      { class: 'content' },
      h(
        'a',
        { class: 'btn primary block', href: `#/c/${enc(courseId)}/d/${day.day}/${firstUnpracticed()}` },
        iconEl('play'),
        '开始练习',
      ),
      h('div', { class: 'list card flush' }, rows),
    ),
  );

  function firstUnpracticed() {
    const i = day!.sentences.findIndex((s) => !prog.get(skey(courseId, s.id))?.practiced);
    return i < 0 ? 0 : i;
  }
}
