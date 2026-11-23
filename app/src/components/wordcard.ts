// 查词卡片（原型 A-Word）：先讲「在这句话里」怎么读，再给美音音标、释义、考试标签，可加入生词本。
import { addWord, hasWord, removeWord, type Hint } from '../db';
import { canSpeak, lookup, speak, type Entry } from '../dict';
import { h, icon } from '../ui';
import { HINT_LABEL } from './richtext';
import { openSheet } from './sheet';

let seq = 0;

export async function openWordCard(word: string, hints: Hint[] = []) {
  const my = ++seq;
  const panel = openSheet(`查词：${word}`);
  const body = h('div', { style: 'display:contents' }, h('p', { class: 'muted' }, '查询中…'));
  panel.append(body);

  const e = await lookup(word);
  if (my !== seq) return;
  body.replaceChildren(...wordCardBody(e, word, hints));
}

/** 卡片内容（查词页也复用） */
export function wordCardBody(e: Entry | null, word: string, hints: Hint[] = []): Node[] {
  const head = h(
    'div',
    { class: 'word-head' },
    h('span', { class: 'en', lang: 'en' }, e?.word ?? word),
    e?.ipa && h('span', { class: 'ipa', lang: 'en' }, `/${e.ipa}/`),
    canSpeak &&
      h('button', {
        class: 'icon-btn say',
        type: 'button',
        'aria-label': `朗读 ${e?.word ?? word}`,
        onclick: () => speak(e?.word ?? word),
        html: icon.speaker,
      }),
  );

  // 重读排在最前面
  const sorted = [...hints].sort((a, b) => Number(b.type === 'stress') - Number(a.type === 'stress'));
  const inSentence =
    sorted.length > 0 &&
    h(
      'div',
      { class: 'in-sentence' },
      h('span', { class: 'small muted' }, '在这句话里'),
      sorted.map((x) =>
        h('span', null, h('span', { class: `kind kind-${x.type}` }, HINT_LABEL[x.type]), '：', noteBody(x)),
      ),
    );

  if (!e) return [head, inSentence || h('span'), h('p', { class: 'muted' }, '词典里没有这个词。')];

  const save = h('button', { class: 'btn outline block', type: 'button' }, '加入生词本');
  let saved = false;
  const paint = () => (save.textContent = saved ? '已在生词本 · 点击移除' : '加入生词本');
  hasWord(e.word).then((v) => ((saved = v), paint()));
  save.addEventListener('click', async () => {
    if (saved) await removeWord(e.word);
    else await addWord({ word: e.word, ipa: e.ipa, zh: e.zh.split('\n')[0] });
    saved = !saved;
    paint();
  });

  return [
    head,
    e.from ? h('p', { class: 'small muted' }, `「${e.from}」的原形`) : h('span'),
    inSentence || h('span'),
    h('div', { class: 'defs' }, e.zh.split('\n').map((l) => h('p', null, l))),
    e.tags.length ? h('div', { class: 'tags' }, e.tags.map((t) => h('span', { class: 'tag' }, t))) : h('span'),
    save,
  ];
}

/** 去掉说明开头重复的类型名：「闪音：t 夹在…」→「t 夹在…」，「弱读 /tə/」→「/tə/」 */
export function noteBody(x: Hint) {
  const note = x.note ?? '';
  const stripped = note.replace(/^[^：:]{1,4}[：:]\s*/, '');
  return stripped !== note ? stripped : note.replace(new RegExp(`^${HINT_LABEL[x.type]}\\s*`), '');
}
