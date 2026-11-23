// 音标详情（原型 A-Phoneme）：大号音标、舌位图 + 嘴型视频位、发音要领、例词跟读、易混音。
import { shadowRow } from '../components/shadow';
import { openWordCard } from '../components/wordcard';
import { contentUrl, loadIpa, type IpaWord, type Phoneme } from '../content';
import { h, icon, iconEl } from '../ui';
import { IPA_COURSE } from './ipa';

const GROUP_LABEL: Record<Phoneme['group'], string> = { vowel: '单元音', diphthong: '双元音', consonant: '辅音' };

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

  const tongue = p.img.length
    ? h(
        'figure',
        { class: 'fig' },
        h(
          'div',
          { class: `imgs${p.img.length > 1 ? ' two' : ''}` },
          p.img.flatMap((src, i) => [
            i > 0 && h('span', { 'aria-hidden': 'true' }, '→'),
            h('img', { src: contentUrl(`ipa/${src}`), alt: `/${p.ipa}/ 的舌位剖面图${p.img.length > 1 ? `（第 ${i + 1} 步）` : ''}` }),
          ]),
        ),
        h('figcaption', null, p.img.length > 1 ? '舌位 · 从左滑到右' : '舌位', p.approx ? '（近似）' : ''),
      )
    : h('figure', { class: 'fig' }, h('figcaption', null, '舌位图准备中', h('br'), '先看下面的发音要领'));

  const video = h(
    'figure',
    { class: 'fig video' },
    h('span', { class: 'play', html: icon.play }),
    h('figcaption', null, '嘴型视频', h('br'), h('span', null, '作者录制中')),
  );

  const wordRow = (w: IpaWord) => {
    const sr = shadowRow(IPA_COURSE, `${p.id}:${w.w}`, `ipa/${w.audio}`);
    disposers.push(sr.dispose);
    return h(
      'div',
      { class: 'word-row' },
      h(
        'button',
        { class: 'word-main', type: 'button', onclick: () => openWordCard(w.w), 'aria-label': `查词 ${w.w}` },
        h('span', { class: 'en', lang: 'en' }, highlight(w.w, w.hl)),
        w.ipa && h('span', { class: 'ipa', lang: 'en' }, w.ipa),
      ),
      sr.el,
    );
  };

  const pairs = p.pairs.map((pid) => all.find((x) => x.id === pid)).filter((x): x is Phoneme => !!x);
  const prev = all[idx - 1];
  const next = all[idx + 1];

  root.append(
    h(
      'header',
      { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#/ipa', 'aria-label': '返回音标表' }, iconEl('back')),
      h('div', { class: 'topbar-title' }, h('span', null, `${GROUP_LABEL[p.group]} · ${idx + 1} / ${all.length}`)),
      h('span', { class: 'icon-btn-spacer' }),
    ),
    h(
      'main',
      { class: 'content' },
      h(
        'div',
        { class: 'phoneme-head' },
        h('span', { class: 'ipa', lang: 'en' }, `/${p.ipa}/`),
        h('div', null, h('strong', null, GROUP_LABEL[p.group]), h('span', { class: 'small muted' }, `例：${p.words.map((w) => w.w).join(' · ')}`)),
      ),
      h('div', { class: 'figs' }, tongue, video),
      h('section', { class: 'prose-block' }, h('h2', { class: 'section-title' }, '发音要领'), h('p', null, p.tip)),
      h(
        'section',
        { class: 'section' },
        h('h2', { class: 'section-title' }, '例词跟读'),
        h('div', { class: 'list' }, p.words.map(wordRow)),
      ),
      pairs.length > 0 &&
        h(
          'div',
          { class: 'pairs' },
          '容易混淆',
          pairs.map((q) => h('a', { href: `#/ipa/${q.id}`, lang: 'en' }, `/${q.ipa}/ ${q.words[0]?.w ?? ''}`)),
        ),
      h(
        'section',
        { class: 'card pad prose-block' },
        h('h2', { class: 'section-title' }, '我的心得'),
        h('p', { class: 'small muted' }, '作者学这个音时的心得、常见错误和练习方法（整理中）。'),
      ),
      h(
        'nav',
        { class: 'pager-line', 'aria-label': '切换音标' },
        h('a', { href: prev ? `#/ipa/${prev.id}` : undefined, 'aria-disabled': !prev ? 'true' : undefined, 'aria-label': '上一个音标' }, iconEl('prev'), prev ? `/${prev.ipa}/` : ''),
        h('a', { href: next ? `#/ipa/${next.id}` : undefined, 'aria-disabled': !next ? 'true' : undefined, 'aria-label': '下一个音标' }, next ? `/${next.ipa}/` : '', iconEl('next')),
      ),
    ),
  );

  return () => disposers.forEach((d) => d());
}

/** 单词里发这个音的字母用强调色 */
function highlight(word: string, hl: string) {
  const i = hl ? word.toLowerCase().indexOf(hl.toLowerCase()) : -1;
  if (i < 0) return word;
  return h('span', null, word.slice(0, i), h('mark', null, word.slice(i, i + hl.length)), word.slice(i + hl.length));
}
