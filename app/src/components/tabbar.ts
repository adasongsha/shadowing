// 底部导航：学习 / 查词 / 我的。只出现在一级页面。
import { h, icon } from '../ui';

export type Tab = 'learn' | 'dict' | 'me';

const TABS: [Tab, string, string, keyof typeof icon][] = [
  ['learn', '#/', '学习', 'book'],
  ['dict', '#/dict', '查词', 'search'],
  ['me', '#/me', '我的', 'user'],
];

export function tabbar(active: Tab) {
  return h(
    'nav',
    { class: 'tabbar', 'aria-label': '主导航' },
    TABS.map(([t, href, label, ic]) =>
      h(
        'a',
        { class: 'tab', href, 'aria-current': t === active ? 'page' : undefined },
        h('span', { class: 'ic', html: icon[ic] }),
        label,
      ),
    ),
  );
}
