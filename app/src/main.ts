// 入口 + hash 路由。
//   #/                         首页（音标 / 句子 / 段落）
//   #/ipa, #/ipa/<id>          音标总览 / 单个音标
//   #/sentences                句子课程库（内置样例课 + 导入的课程包）
//   #/paragraphs               段落（筹备中）
//   #/dict                     查词
//   #/credits                  素材来源
//   #/c/<courseId>             Day 列表
//   #/c/<courseId>/d/<day>     句子列表
//   #/c/<courseId>/d/<day>/<i> 练习页（第 i 句，从 0 开始）
//   #/c/<courseId>/d/<day>/<i>/why  这句为什么这样读
//   #/me（旧 #/settings）       我的
import './style.css';
import { player } from './audio';
import { homeView } from './views/home';
import { ipaView } from './views/ipa';
import { phonemeView } from './views/phoneme';
import { creditsView, dictView, paragraphsView } from './views/misc';
import { libraryView } from './views/library';
import { courseView } from './views/course';
import { dayView } from './views/day';
import { practiceView } from './views/practice';
import { meView } from './views/me';
import { explainView } from './views/explain';

export type Cleanup = (() => void) | void;
export type View = (root: HTMLElement, params: string[]) => Promise<Cleanup> | Cleanup;

const routes: [RegExp, View][] = [
  [/^\/?$/, homeView],
  [/^\/ipa$/, ipaView],
  [/^\/ipa\/([a-z]+)$/, phonemeView],
  [/^\/sentences$/, libraryView],
  [/^\/paragraphs$/, paragraphsView],
  [/^\/dict$/, dictView],
  [/^\/credits$/, creditsView],
  [/^\/(?:me|settings)$/, meView],
  [/^\/c\/([^/]+)$/, courseView],
  [/^\/c\/([^/]+)\/d\/(\d+)$/, dayView],
  [/^\/c\/([^/]+)\/d\/(\d+)\/(\d+)$/, practiceView],
  [/^\/c\/([^/]+)\/d\/(\d+)\/(\d+)\/why$/, explainView],
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
  // 切换页面时不释放麦克风：iOS 每次重新申请都可能再弹一次权限。只在 App 进入后台时释放（见 audio.ts）
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
