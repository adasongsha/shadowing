// 查词页（含生词本）、段落占位页、素材来源页。
import { tabbar } from '../components/tabbar';
import { openWordCard, wordCardBody } from '../components/wordcard';
import { loadIpa } from '../content';
import { listWords, removeWord } from '../db';
import { lookup } from '../dict';
import { h, icon, iconEl } from '../ui';

const topbar = (title: string, back = '#/') =>
  h(
    'header',
    { class: 'topbar' },
    h('a', { class: 'icon-btn', href: back, 'aria-label': '返回' }, iconEl('back')),
    h('div', { class: 'topbar-title' }, h('strong', null, title)),
    h('span', { class: 'icon-btn-spacer' }),
  );

// ---------- 查词 + 生词本 ----------

export async function dictView(root: HTMLElement) {
  root.classList.add('has-tabbar');
  const input = h('input', {
    type: 'search',
    class: 'search-input',
    id: 'dict-q',
    placeholder: '输入英文单词',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'search',
    lang: 'en',
    'aria-label': '查单词',
  }) as HTMLInputElement;
  const result = h('div', { class: 'section' });
  const book = h('section', { class: 'section' });
  let seq = 0;

  async function run() {
    const q = input.value.trim();
    const my = ++seq;
    book.hidden = !!q;
    if (!q) {
      result.replaceChildren(h('p', { class: 'small muted' }, '收录约 3.7 万个常用词，支持词形变化（went → go），离线也能查。'));
      return;
    }
    const e = await lookup(q);
    if (my !== seq) return;
    result.replaceChildren(
      e ? h('div', { class: 'card entry' }, ...wordCardBody(e, q)) : h('p', { class: 'muted' }, `没有找到「${q}」。`),
    );
  }

  async function renderBook() {
    const words = await listWords();
    book.replaceChildren(
      h('h2', { class: 'section-title' }, `生词本 · ${words.length}`),
      words.length
        ? h(
            'div',
            { class: 'list' },
            words.map((w) =>
              h(
                'div',
                { class: 'row wb-row' },
                h(
                  'button',
                  { class: 'row-main', type: 'button', style: { border: 0, background: 'none', padding: 0, textAlign: 'left' }, onclick: () => openWordCard(w.word) },
                  h('span', null, h('span', { class: 'en', lang: 'en' }, w.word), w.ipa && h('span', { class: 'ipa muted', lang: 'en', style: { marginLeft: '10px' } }, `/${w.ipa}/`)),
                  h('span', { class: 'zh' }, w.zh),
                ),
                h('button', {
                  class: 'icon-btn',
                  type: 'button',
                  'aria-label': `从生词本移除 ${w.word}`,
                  html: icon.close,
                  onclick: async () => (await removeWord(w.word), renderBook()),
                }),
              ),
            ),
          )
        : h('p', { class: 'small muted' }, '在句子里点一个词，查词卡片里点「加入生词本」，它就会出现在这里。'),
    );
  }

  let t: number | undefined;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = window.setTimeout(run, 150);
  });
  root.append(
    h('main', { class: 'content' }, h('header', { class: 'page-head' }, h('h1', null, '查词')), input, result, book),
    tabbar('dict'),
  );
  run();
  renderBook();
}

// ---------- 段落（占位） ----------

export function paragraphsView(root: HTMLElement) {
  root.append(
    topbar('段落'),
    h(
      'main',
      { class: 'content' },
      h(
        'div',
        { class: 'card empty' },
        h('p', { class: 'empty-title' }, '段落练习筹备中'),
        h('p', null, '计划的练习方式：先逐句跟读，再整段录一遍和原音对比；并标出意群停顿和重读。'),
        h('a', { class: 'btn ink', href: '#/sentences' }, '先去练句子'),
      ),
    ),
  );
}

// ---------- 素材来源 ----------

export async function creditsView(root: HTMLElement) {
  const ipa = await loadIpa().catch(() => null);
  const src = (name: string, what: string, lic: string, url: string) =>
    h('li', null, h('a', { href: url, target: '_blank', rel: 'noopener' }, name), `：${what}（${lic}）`);
  root.append(
    topbar('素材来源与许可', '#/me'),
    h(
      'main',
      { class: 'content prose' },
      h('p', null, 'App 里的公开内容来自以下开放资源，在此致谢。'),
      h(
        'ul',
        null,
        src('ECDICT', '英汉词典释义、考试标签、词形变化', 'MIT License', 'https://github.com/skywind3000/ECDICT'),
        src('CMU Pronouncing Dictionary', '美式发音（转写为国际音标）', 'BSD 2-Clause', 'https://github.com/cmusphinx/cmudict'),
        src('Kokoro-82M', '例词和样例句子的语音合成', 'Apache 2.0', 'https://huggingface.co/hexgrad/Kokoro-82M'),
        src('Richard Wright & Dan McCloy：phonetics-teaching-assets', '音标页的口腔剖面图', 'CC0 1.0 公共领域', 'https://github.com/drammock/phonetics-teaching-assets'),
        src('Source Serif 4（Adobe）', '英文句子字体', 'SIL Open Font License 1.1', 'https://github.com/adobe-fonts/source-serif'),
        src('Gentium Book Plus（SIL International）', '音标字体', 'SIL Open Font License 1.1', 'https://software.sil.org/gentium/'),
      ),
      ipa?.credits.length &&
        h(
          'details',
          null,
          h('summary', null, `剖面图逐一出处（${ipa.credits.length} 张）`),
          h(
            'ul',
            { class: 'small' },
            ipa.credits.map((c) =>
              h('li', null, h('a', { href: c.page, target: '_blank', rel: 'noopener' }, c.title), ` · ${c.artist || '未署名'} · ${c.license}`),
            ),
          ),
        ),
      h('p', { class: 'muted small' }, '样例句子为原创内容。单词朗读使用设备自带的语音。你导入的私人课程包和录音只保存在本机，不会上传。'),
    ),
  );
}
