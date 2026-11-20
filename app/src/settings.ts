// 轻量偏好设置，存 localStorage（读写都 try/catch，失败时用默认值）。

export interface Settings {
  rate: 0.75 | 1;
  hideText: boolean;
  focusMode: boolean;
  /** 录完立即释放麦克风：如果实测录音后回放声音很小（走了听筒），打开它 */
  releaseMicAfterRecord: boolean;
}

const DEFAULTS: Settings = { rate: 1, hideText: false, focusMode: false, releaseMicAfterRecord: false };
const KEY = 'shadowing.settings';

let cache: Settings | null = null;

export const settings = {
  get(): Settings {
    if (!cache) {
      try {
        cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
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
