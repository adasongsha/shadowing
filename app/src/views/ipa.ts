// 音标总览：按单元音 / 双元音 / 辅音分组的网格，练过的音标有标记。
import { loadIpa, type Phoneme } from '../content';
import { progressMap } from '../db';
import { h, iconEl } from '../ui';

export const IPA_COURSE = 'ipa';
const GROUPS: [Phoneme['group'], string][] = [
  ['vowel', '单元音'],
  ['diphthong', '双元音'],
  ['consonant', '辅音'],
];

export async function ipaView(root: HTMLElement) {
  root.append(
    h(
      'header',
      { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#/', 'aria-label': '返回首页' }, iconEl('back')),
      h('h1', null, '音标'),
      h('span', { class: 'icon-btn-spacer' }),
    ),
  );
  const main = h('main', { class: 'content' }, h('p', { class: 'muted' }, '加载中…'));
  root.append(main);

  let data;
  try {
    data = await loadIpa();
  } catch (e: any) {
    main.replaceChildren(h('p', { class: 'muted' }, `音标数据加载失败：${e?.message ?? e}。联网打开一次后即可离线使用。`));
    return;
  }
  const prog = await progressMap(IPA_COURSE);
  // 某个音标下任意例词录过音，就算练过
  const practiced = (p: Phoneme) => p.words.some((w) => prog.get(`${IPA_COURSE}/${p.id}:${w.w}`)?.practiced);

  main.replaceChildren(
    h('p', { class: 'muted small' }, '美式英语共 41 个音素。点开一个音标，看舌位图和发音要领，再跟读例词。'),
    ...GROUPS.map(([g, label]) => {
      const items = data.phonemes.filter((p) => p.group === g);
      return h(
        'section',
        { class: 'ipa-group' },
        h('h2', { class: 'section-title' }, `${label} · ${items.length}`),
        h(
          'div',
          { class: 'ipa-grid' },
          items.map((p) =>
            h(
              'a',
              { class: `ipa-cell${practiced(p) ? ' done' : ''}`, href: `#/ipa/${p.id}` },
              h('span', { class: 'ipa-sym', lang: 'en' }, `/${p.ipa}/`),
              h('span', { class: 'ipa-eg', lang: 'en' }, p.words[0]?.w ?? ''),
            ),
          ),
        ),
      );
    }),
  );
}
