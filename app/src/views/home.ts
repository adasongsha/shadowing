// 首页：音标 / 句子 / 段落 三个模块 + 查词。
import { h, icon, iconEl, isStandalone } from '../ui';

export function homeView(root: HTMLElement) {
  const mod = (href: string, sym: string, title: string, sub: string, soon = false) =>
    h(
      'a',
      { class: `module card${soon ? ' soon' : ''}`, href },
      h('span', { class: 'module-sym', lang: 'en' }, sym),
      h('span', { class: 'module-text' }, h('span', { class: 'module-title' }, title, soon && h('span', { class: 'tag' }, '筹备中')), h('span', { class: 'module-sub' }, sub)),
      iconEl('chevron'),
    );

  root.append(
    h(
      'header',
      { class: 'topbar' },
      h('h1', null, '美音跟读'),
      h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': '设置' }, iconEl('gear')),
    ),
    h(
      'main',
      { class: 'content' },
      !isStandalone() &&
        h('div', { class: 'hint' }, '建议在 Safari 里点「分享」→「添加到主屏幕」，从主屏幕打开：数据更不容易被系统清理，也能离线练习。'),
      h(
        'a',
        { class: 'search-entry card', href: '#/dict' },
        h('span', { class: 'ic', html: icon.search }),
        '查单词：美音音标、中文释义',
      ),
      h(
        'div',
        { class: 'modules' },
        mod('#/ipa', 'æ', '音标', '41 个美音音素：舌位图、发音要领、例词跟读'),
        mod('#/sentences', 'a‿i', '句子', '跟读对比，带连读、弱读、闪音提示'),
        mod('#/paragraphs', '¶', '段落', '整段跟读与语调练习', true),
      ),
      h('p', { class: 'muted small center' }, h('a', { href: '#/credits' }, '素材来源与许可')),
    ),
  );
}
