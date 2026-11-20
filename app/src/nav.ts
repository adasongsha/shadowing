// 导航：replace=true 时不新增历史记录（练习页切句用，避免「返回」要按很多次）
export function go(path: string, replace = false) {
  const url = '#' + path;
  if (replace) {
    history.replaceState(null, '', url);
    window.dispatchEvent(new Event('app:navigate'));
  } else location.hash = url;
}

export const enc = encodeURIComponent;
