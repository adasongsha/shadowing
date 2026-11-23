// 通用底部面板：查词卡片、练习页的显示设置都用它。同一时间只开一个。
import { h } from '../ui';

let current: { wrap: HTMLElement; onClose?: () => void } | null = null;

export function closeSheet() {
  if (!current) return;
  const { wrap, onClose } = current;
  current = null;
  wrap.classList.remove('open');
  setTimeout(() => wrap.remove(), 220);
  onClose?.();
}

/** 打开面板，返回面板主体元素（往里放内容） */
export function openSheet(label: string, onClose?: () => void) {
  closeSheet();
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': label }, h('div', { class: 'sheet-grip' }));
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e: Event) => e.target === wrap && closeSheet() }, panel);
  document.body.append(wrap);
  current = { wrap, onClose };
  requestAnimationFrame(() => wrap.classList.add('open'));

  // 下滑关闭
  let y0 = 0;
  panel.addEventListener('touchstart', (e) => (y0 = panel.scrollTop <= 0 ? e.touches[0].clientY : NaN), { passive: true });
  panel.addEventListener(
    'touchend',
    (e) => {
      if (!Number.isNaN(y0) && e.changedTouches[0].clientY - y0 > 80) closeSheet();
    },
    { passive: true },
  );
  return panel;
}

window.addEventListener('hashchange', closeSheet);
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeSheet());
