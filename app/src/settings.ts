// 轻量偏好设置，存 localStorage（读写都 try/catch，失败时用默认值）。

/** 文本显示：all 英文+中文 / en 只显示英文（隐藏中文）/ none 全部隐藏 */
export type TextMode = 'all' | 'en' | 'none';

export interface Settings {
  rate: 0.75 | 1;
  textMode: TextMode;
  focusMode: boolean;
  /** 显示连读 / 弱读等发音提示 */
  showHints: boolean;
  /** 练习页「这句话为什么这样读」默认展开 */
  noteOpen: boolean;
  /** 录完立即释放麦克风：如果实测录音后回放声音很小（走了听筒），打开它 */
  releaseMicAfterRecord: boolean;
}

const DEFAULTS: Settings = { rate: 1, textMode: 'all', focusMode: false, showHints: true, noteOpen: true, releaseMicAfterRecord: false };
const KEY = 'shadowing.settings';

let cache: Settings | null = null;

export const settings = {
  get(): Settings {
    if (!cache) {
      try {
        const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
        // 兼容旧版的 hideText 开关
        if (saved.textMode === undefined && saved.hideText) saved.textMode = 'none';
        delete saved.hideText;
        cache = { ...DEFAULTS, ...saved };
      } catch {
        cache = { ...DEFAULTS };
      }
    }
    return cache!;
  },
  set(patch: Partial<Settings>) {
    cache = { ...settings.get(), ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(cache));
    } catch {
      /* 隐私模式等情况下忽略 */
    }
  },
};
