// 查词卡片：从底部弹出，显示美音音标、中文释义、考试标签、相关的发音提示。
import type { Hint } from '../db';
import { canSpeak, lookup, speak } from '../dict';
import { h, icon } from '../ui';
import { HINT_LABEL } from './richtext';

let sheet: HTMLElement | null = null;
let seq = 0;

export function closeWordCard() {
  sheet?.classList.remove('open');
  const s = sheet;
  sheet = null;
  setTimeout(() => s?.remove(), 200);
}

export async function openWordCard(word: string, hints: Hint[] = []) {
  const my = ++seq;
  closeWordCard();
  const body = h('div', { class: 'sheet-body' }, h('p', { class: 'muted' }, '查询中…'));
  const panel = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-label': `查词：${word}` },
    h('div', { class: 'sheet-grip' }),
    body,
  );
  const backdrop = h('div', { class: 'sheet-wrap', onclick: (e: Event) => e.target === backdrop && closeWordCard() }, panel);
  document.body.append(backdrop);
  sheet = backdrop;
  requestAnimationFrame(() => backdrop.classList.add('open'));

  const e = await lookup(word);
  if (my !== seq) return;
  const sayBtn = (w: string) =>
    canSpeak &&
    h('button', { class: 'icon-btn say', type: 'button', 'aria-label': `朗读 ${w}`, onclick: () => speak(w), html: icon.speaker });

  const hintList =
    hints.length > 0 &&
    h(
      'ul',
      { class: 'sheet-hints' },
      hints.map((x) => h('li', null, h('span', { class: `tag tag-${x.type}` }, HINT_LABEL[x.type]), x.note ?? '')),
    );

  if (!e) {
    body.replaceChildren(
      h(
        'div',
        null,
        h('div', { class: 'sheet-head' }, h('span', { class: 'sheet-word', lang: 'en' }, word), sayBtn(word)),
        h('p', { class: 'muted' }, '词典里没有这个词。'),
        hintList,
      ),
    );
    return;
  }
  body.replaceChildren(h('div', null,
    h(
      'div',
      { class: 'sheet-head' },
      h('span', { class: 'sheet-word', lang: 'en' }, e.word),
      e.ipa && h('span', { class: 'sheet-ipa' }, `/${e.ipa}/`),
      sayBtn(e.word),
    ),
    e.from && h('p', { class: 'muted small' }, `「${e.from}」的原形`),
    h('div', { class: 'sheet-zh' }, e.zh.split('\n').map((l) => h('p', null, l))),
    e.tags.length > 0 && h('div', { class: 'sheet-tags' }, e.tags.map((t) => h('span', { class: 'tag' }, t))),
    hintList,
  ));
}

window.addEventListener('hashchange', closeWordCard);
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeWordCard());
