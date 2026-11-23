// App 内置的公开内容（public/content/ 下的静态文件）：音标数据、样例句子课。
// 路径一律相对当前页面，部署在子路径或以后套原生壳都能用。
import { getCourse } from './db';
import { importPack } from './importer';

export const contentUrl = (path: string) => new URL(`content/${path}`, document.baseURI).href;

async function fetchOk(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`加载失败（${r.status}）：${url}`);
  return r;
}

// ---------- 音标 ----------

export interface IpaWord {
  w: string;
  /** 单词里发这个音的字母，用于高亮 */
  hl: string;
  ipa: string;
  audio: string;
}

export interface Phoneme {
  id: string;
  ipa: string;
  group: 'vowel' | 'diphthong' | 'consonant';
  img: string[];
  approx: boolean;
  tip: string;
  words: IpaWord[];
  pairs: string[];
}

export interface Credit {
  file: string;
  title: string;
  license: string;
  artist: string;
  page: string;
}

let ipaP: Promise<{ phonemes: Phoneme[]; credits: Credit[] }> | null = null;
export function loadIpa() {
  if (!ipaP) {
    ipaP = fetchOk(contentUrl('ipa/index.json')).then((r) => r.json());
    ipaP.catch(() => (ipaP = null)); // 失败了下次重试
  }
  return ipaP;
}

const blobCache = new Map<string, Promise<Blob>>();
/** 预先把音频取成 Blob：iOS 要求在点击的同步调用栈里开始播放，不能点了再去 fetch */
export function fetchBlob(path: string) {
  let p = blobCache.get(path);
  if (!p) {
    p = fetchOk(contentUrl(path)).then((r) => r.blob());
    p.catch(() => blobCache.delete(path));
    blobCache.set(path, p);
  }
  return p;
}

// ---------- 内置句子课 ----------

export const BUILTIN_SENTENCES = { id: 'sample-sentences', zip: 'sentences/sample.zip', version: 'sentences/sample.json' };
const DISMISS_KEY = 'shadowing.builtin.dismissed';

/**
 * 内置样例课没装过就装上；装过但内容有新版本就更新（按句子 id 合并，录音和标记都保留）。
 * 用户手动删除过则不再自动装。返回 true 表示装了或更新了。
 */
export async function ensureBuiltinCourse(onProgress?: (m: string) => void) {
  const existing = await getCourse(BUILTIN_SENTENCES.id);
  if (existing) {
    let latest: string | undefined;
    try {
      latest = (await (await fetchOk(contentUrl(BUILTIN_SENTENCES.version))).json()).version;
    } catch {
      return false; // 离线等情况：继续用已安装的版本
    }
    if (!latest || latest === existing.version) return false;
    onProgress?.('样例课有更新…');
  } else {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return false;
    } catch {
      /* 忽略 */
    }
    onProgress?.('正在准备样例课…');
  }
  const blob = await (await fetchOk(contentUrl(BUILTIN_SENTENCES.zip))).blob();
  await importPack(blob, onProgress);
  return true;
}

export function dismissBuiltin(dismissed: boolean) {
  try {
    if (dismissed) localStorage.setItem(DISMISS_KEY, '1');
    else localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* 忽略 */
  }
}
