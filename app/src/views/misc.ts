// 查词页、段落占位页、素材来源页。
import { loadIpa } from '../content';
import { canSpeak, lookup, speak, type Entry } from '../dict';
import { h, icon, iconEl } from '../ui';

const topbar = (title: string, back = '#/') =>
  h(
    'header',
    { class: 'topbar' },
    h('a', { class: 'icon-btn', href: back, 'aria-label': '返回' }, iconEl('back')),
    h('h1', null, title),
    h('span', { class: 'icon-btn-spacer' }),
  );

// ---------- 查词 ----------

export function dictView(root: HTMLElement) {
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
  }) as HTMLInputElement;
  const result = h('div', { class: 'dict-result' });
  let seq = 0;

  async function run() {
    const q = input.value.trim();
    const my = ++seq;
    if (!q) {
      result.replaceChildren(h('p', { class: 'muted small' }, '收录约 3.7 万个常用词，支持词形变化（went → go）。离线也能查。'));
      return;
    }
    const e = await lookup(q);
    if (my !== seq) return;
    result.replaceChildren(e ? entryCard(e) : h('p', { class: 'muted' }, `没有找到「${q}」。`));
  }
  let t: number | undefined;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = window.setTimeout(run, 150);
  });
  root.append(topbar('查词'), h('main', { class: 'content' }, input, result));
  run();
  setTimeout(() => input.focus(), 50);
}

function entryCard(e: Entry) {
  return h(
    'div',
    { class: 'card entry' },
    h(
      'div',
      { class: 'sheet-head' },
      h('span', { class: 'sheet-word', lang: 'en' }, e.word),
      e.ipa && h('span', { class: 'sheet-ipa', lang: 'en' }, `/${e.ipa}/`),
      canSpeak && h('button', { class: 'icon-btn say', type: 'button', 'aria-label': `朗读 ${e.word}`, onclick: () => speak(e.word), html: icon.speaker }),
    ),
    e.from && h('p', { class: 'muted small' }, `「${e.from}」的原形`),
    h('div', { class: 'sheet-zh' }, e.zh.split('\n').map((l) => h('p', null, l))),
    e.tags.length > 0 && h('div', { class: 'sheet-tags' }, e.tags.map((x) => h('span', { class: 'tag' }, x))),
  );
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
        { class: 'empty' },
        h('p', { class: 'empty-title' }, '段落练习筹备中'),
        h('p', null, '计划的练习方式：先逐句跟读，再整段录一遍和原音对比；并标出意群停顿和重读。'),
        h('p', null, h('a', { href: '#/sentences' }, '先去练句子 →')),
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
    topbar('素材来源与许可'),
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
