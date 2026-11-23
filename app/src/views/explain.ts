// 句子讲解页（原型 A-Explain）：这句话想说什么 → 于是发音这样变（编号批注）→ 去跟读。
import { changeList, HINT_LABEL, renderSentence } from '../components/richtext';
import { openWordCard, noteBody } from '../components/wordcard';
import { getCourse } from '../db';
import { enc } from '../nav';
import { h, icon, iconEl } from '../ui';

export async function explainView(root: HTMLElement, [courseId, dayStr, idxStr]: string[]) {
  const course = await getCourse(courseId);
  const day = course?.days.find((d) => d.day === Number(dayStr));
  const idx = Number(idxStr);
  const s = day?.sentences[idx];
  if (!course || !day || !s) {
    location.hash = `#/c/${enc(courseId)}`;
    return;
  }
  const back = `#/c/${enc(courseId)}/d/${day.day}/${idx}`;
  const changes = changeList(s.text, s.hints);
  const numbers = new Map(changes.map((c) => [c.afterWord, c.n]));
  const stressed = (s.hints ?? []).filter((x) => x.type === 'stress').map((x) => s.text.slice(x.from, x.to));

  root.classList.add('marks-on');
  root.append(
    h(
      'header',
      { class: 'topbar' },
      h('a', { class: 'icon-btn', href: back, 'aria-label': '回到练习' }, iconEl('back')),
      h('div', { class: 'topbar-title' }, h('strong', null, '为什么这样读')),
      h('span', { class: 'icon-btn-spacer' }),
    ),
    h(
      'main',
      { class: 'content' },
      h(
        'section',
        { class: 'explain-sentence' },
        h('p', { class: 'sentence', lang: 'en' }, renderSentence(s.text, s.hints, (t) => openWordCard(t.word, t.hints), numbers)),
        s.zh && h('p', { class: 'translation' }, s.zh),
      ),
      s.note &&
        h(
          'section',
          { class: 'prose-block' },
          h('h2', { class: 'section-title' }, '这句话想说什么'),
          h('p', null, s.note),
          stressed.length > 0 &&
            h('p', { class: 'small muted' }, '重读（加粗）：', h('span', { class: 'en', lang: 'en', style: { color: 'var(--text)', fontWeight: '700' } }, stressed.join(' · '))),
        ),
      changes.length > 0 &&
        h(
          'section',
          { class: 'prose-block' },
          h('h2', { class: 'section-title' }, '于是发音这样变'),
          h(
            'ol',
            { class: 'changes' },
            changes.flatMap((c) => [
              h('li', { class: 'n', 'aria-hidden': 'true' }, c.n),
              h(
                'li',
                null,
                h('span', { class: 'snippet', lang: 'en' }, c.snippet),
                c.items.map((x) => h('span', { class: 'change-line' }, h('span', { class: `kind kind-${x.type}` }, HINT_LABEL[x.type]), ' ', noteBody(x))),
              ),
            ]),
          ),
        ),
      day.intro &&
        h(
          'a',
          { class: 'card row', href: `#/c/${enc(courseId)}/d/${day.day}` },
          h('span', { class: 'row-main' }, h('span', null, `本组讲解：${day.title.split(/[：:]/)[0]}是什么，为什么会这样`)),
          h('span', { class: 'ic chev', html: icon.chevron }),
        ),
      h('div', { class: 'sticky-foot' }, h('a', { class: 'btn ink block', href: back }, '明白了，去跟读')),
    ),
  );
}
