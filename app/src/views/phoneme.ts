// 单个音标页：舌位剖面图、发音要领、例词（逐个跟读）、易混音、我的心得。
import { shadowRow } from '../components/shadow';
import { openWordCard } from '../components/wordcard';
import { contentUrl, loadIpa, type IpaWord } from '../content';
import { h, iconEl } from '../ui';
import { IPA_COURSE } from './ipa';

export async function phonemeView(root: HTMLElement, [id]: string[]) {
  const data = await loadIpa().catch(() => null);
  const p = data?.phonemes.find((x) => x.id === id);
  if (!data || !p) {
    location.hash = '#/ipa';
    return;
  }
  const all = data.phonemes;
  const idx = all.indexOf(p);
  const disposers: (() => void)[] = [];

  const figure = p.img.length
    ? h(
        'figure',
        { class: 'sagittal' },
        h(
          'div',
          { class: 'sagittal-imgs' },
          p.img.flatMap((src, i) => [
            i > 0 && h('span', { class: 'sagittal-arrow', 'aria-hidden': 'true' }, '→'),
            h('img', { src: contentUrl(`ipa/${src}`), alt: `/${p.ipa}/ 的舌位剖面图${p.img.length > 1 ? `（第 ${i + 1} 步）` : ''}`, loading: 'lazy' }),
          ]),
        ),
        h(
          'figcaption',
          { class: 'muted small' },
          p.img.length > 1 ? '口型从左图滑到右图。' : '',
          p.approx ? '这张图是近似口型，仅供参考。' : '',
          '声带振动时，图中喉部画成波浪线。',
        ),
      )
    : h('div', { class: 'sagittal empty-fig' }, h('p', { class: 'muted small' }, '这个音的舌位图还在准备中，先看下面的发音要领。'));

  const wordRow = (w: IpaWord) => {
    const sr = shadowRow(IPA_COURSE, `${p.id}:${w.w}`, `ipa/${w.audio}`);
    disposers.push(sr.dispose);
    return h(
      'div',
      { class: 'word-row' },
      h(
        'button',
        { class: 'word-main', type: 'button', onclick: () => openWordCard(w.w) },
        h('span', { class: 'word-w', lang: 'en' }, highlight(w.w, w.hl)),
        w.ipa && h('span', { class: 'word-ipa', lang: 'en' }, `/${w.ipa}/`),
      ),
      sr.el,
    );
  };

  const pairs = p.pairs.map((pid) => all.find((x) => x.id === pid)).filter(Boolean);

  root.append(
    h(
      'header',
      { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#/ipa', 'aria-label': '返回音标列表' }, iconEl('back')),
      h('h1', { lang: 'en' }, `/${p.ipa}/`),
      h('span', { class: 'icon-btn-spacer' }),
    ),
    h(
      'main',
      { class: 'content phoneme' },
      figure,
      h('section', { class: 'card tip' }, h('h2', { class: 'section-title' }, '发音要领'), h('p', null, p.tip)),
      h(
        'section',
        null,
        h('h2', { class: 'section-title' }, '例词跟读'),
        h('p', { class: 'muted small' }, '点单词可以查词；右边依次是：原音、录音、我的录音、对比。'),
        h('div', { class: 'card flush words' }, p.words.map(wordRow)),
      ),
      pairs.length > 0 &&
        h(
          'section',
          null,
          h('h2', { class: 'section-title' }, '容易混淆'),
          h(
            'div',
            { class: 'pair-links' },
            pairs.map((q) => h('a', { class: 'chip', href: `#/ipa/${q!.id}`, lang: 'en' }, `/${q!.ipa}/ ${q!.words[0]?.w ?? ''}`)),
          ),
        ),
      h(
        'section',
        { class: 'card mynote' },
        h('h2', { class: 'section-title' }, '我的心得'),
        h('p', { class: 'muted small' }, '这里会放作者学这个音时的心得、常见错误和练习方法（内容整理中）。'),
      ),
      h(
        'nav',
        { class: 'pager inline' },
        h('a', { class: 'btn', href: idx > 0 ? `#/ipa/${all[idx - 1].id}` : undefined, 'aria-disabled': idx === 0 }, iconEl('prev'), idx > 0 ? `/${all[idx - 1].ipa}/` : ''),
        h('span', { class: 'pager-pos' }, `${idx + 1} / ${all.length}`),
        h('a', { class: 'btn', href: idx < all.length - 1 ? `#/ipa/${all[idx + 1].id}` : undefined, 'aria-disabled': idx >= all.length - 1 }, idx < all.length - 1 ? `/${all[idx + 1].ipa}/` : '', iconEl('next')),
      ),
    ),
  );

  return () => disposers.forEach((d) => d());
}

/** 把单词里发这个音的字母加粗高亮 */
function highlight(word: string, hl: string) {
  const i = hl ? word.toLowerCase().indexOf(hl.toLowerCase()) : -1;
  if (i < 0) return word;
  return h('span', null, word.slice(0, i), h('mark', null, word.slice(i, i + hl.length)), word.slice(i + hl.length));
}
