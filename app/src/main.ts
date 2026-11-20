// 入口 + hash 路由。
//   #/                         课程库
//   #/c/<courseId>             Day 列表
//   #/c/<courseId>/d/<day>     句子列表
//   #/c/<courseId>/d/<day>/<i> 练习页（第 i 句，从 0 开始）
//   #/settings                 设置
import './style.css';
import { player, recorder } from './audio';
import { libraryView } from './views/library';
import { courseView } from './views/course';
import { dayView } from './views/day';
import { practiceView } from './views/practice';
import { settingsView } from './views/settings';

export type Cleanup = (() => void) | void;
export type View = (root: HTMLElement, params: string[]) => Promise<Cleanup> | Cleanup;

const routes: [RegExp, View][] = [
  [/^\/?$/, libraryView],
  [/^\/settings$/, settingsView],
  [/^\/c\/([^/]+)$/, courseView],
  [/^\/c\/([^/]+)\/d\/(\d+)$/, dayView],
  [/^\/c\/([^/]+)\/d\/(\d+)\/(\d+)$/, practiceView],
];

const root = document.getElementById('app')!;
let cleanup: Cleanup;
let seq = 0;

async function render() {
  const my = ++seq;
  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;
  player.stop();
  const path = decodeURIComponent(location.hash.replace(/^#/, ''));
  // 离开练习页时释放麦克风
  if (!path.match(routes[4][0])) recorder.release();
  for (const [re, view] of routes) {
    const m = path.match(re);
    if (m) {
      const page = document.createElement('div');
      page.className = 'page';
      const c = await view(page, m.slice(1));
      if (my !== seq) {
        if (typeof c === 'function') c();
        return;
      }
      root.replaceChildren(page);
      cleanup = c;
      return;
    }
  }
  location.hash = '#/';
}

window.addEventListener('hashchange', render);
window.addEventListener('app:navigate', render);
render();

// 申请持久化存储（降低被系统清理的概率）
navigator.storage?.persist?.().catch(() => {});

// 生产环境注册 Service Worker（离线可用）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
