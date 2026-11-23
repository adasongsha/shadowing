// 句子练习页（原型 F-Practice）：衬线大字句子 + 发音标记，原音 / 我的波形对比，
// 「为什么这样读」摘要，底部操作区（原音 / 我的 / 录音 / 对比）。显示设置收在 Aa 面板里。
import { player, recorder, MAX_RECORD_MS } from '../audio';
import { hintLegend, renderSentence } from '../components/richtext';
import { openSheet } from '../components/sheet';
import { openWordCard } from '../components/wordcard';
import {
  addRecording,
  getAudio,
  getCourse,
  listRecordings,
  progressMap,
  setMark,
  skey,
  type Mark,
  type Recording,
} from '../db';
import { enc, go } from '../nav';
import { settings, type TextMode } from '../settings';
import { fmtAgo, h, icon, iconEl, toast } from '../ui';
import { durationFeedback, waveOf, type Wave } from '../wave';

const TEXT_MODES: [TextMode, string][] = [
  ['all', '英文 + 中文'],
  ['en', '只看英文'],
  ['none', '全部隐藏'],
];

export async function practiceView(root: HTMLElement, [courseId, dayStr, idxStr]: string[]) {
  const course = await getCourse(courseId);
  const day = course?.days.find((d) => d.day === Number(dayStr));
  const idx = Number(idxStr);
  const s = day?.sentences[idx];
  if (!course || !day || !s) {
    location.hash = `#/c/${enc(courseId)}`;
    return;
  }
  settings.set({ last: { courseId, day: day.day, idx } });

  const base = `/c/${enc(courseId)}/d/${day.day}`;
  const total = day.sentences.length;
  const [orig, recs, prog] = await Promise.all([getAudio(courseId, s.id), listRecordings(courseId, s.id), progressMap(courseId)]);
  let recordings: Recording[] = recs;
  let mark: Mark = prog.get(skey(courseId, s.id))?.mark ?? 'none';
  const st = settings.get();
  const hasHints = !!s.hints?.length;
  const hasStress = !!s.hints?.some((x) => x.type === 'stress');

  // ---------- 句子 ----------
  const text = h(
    'div',
    { class: 'sentence-text' },
    h(
      'p',
      { class: `sentence${hasStress ? '' : ' plain'}`, lang: 'en' },
      renderSentence(s.text, s.hints, (t) => openWordCard(t.word, t.hints)),
    ),
    s.zh && h('p', { class: 'translation' }, s.zh),
  );
  const peekHint = h('p', { class: 'peek-hint' });
  const sentenceBlock = h('section', { class: 'sentence-block' }, text, peekHint, hasHints && hintLegend(s.hints));
  // 文本被隐藏时，第一下点击只是「偷看」，不触发查词
  sentenceBlock.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement;
      if (st.textMode === 'none' && !text.classList.contains('peek')) {
        text.classList.add('peek');
        e.stopPropagation();
      } else if (st.textMode !== 'all' && !target.closest('.w')) {
        text.classList.toggle('peek');
      }
    },
    true,
  );

  // ---------- 波形 ----------
  const waveOrig = h('div', { class: 'wave', 'aria-hidden': 'true' });
  const waveMine = h('div', { class: 'wave empty' }, '录一遍后，这里显示你的波形');
  const waveNote = h('p', { class: 'wave-note' });
  const waves = h(
    'section',
    { class: 'card waves', 'aria-label': '波形对比' },
    h('div', { class: 'wave-row orig' }, h('span', { class: 'wave-label' }, '原音'), waveOrig),
    h('div', { class: 'wave-row mine' }, h('span', { class: 'wave-label' }, '我的'), waveMine),
    waveNote,
  );
  let origWave: Wave | null = null;
  const drawBars = (el: HTMLElement, w: Wave) => {
    el.classList.remove('empty');
    el.replaceChildren(...w.bars.map((b) => h('i', { style: { height: `${Math.max(3, Math.round(b * 34))}px` } })));
  };
  async function renderWaves() {
    if (orig && !origWave) {
      origWave = await waveOf(orig);
      if (origWave) drawBars(waveOrig, origWave);
    }
    const latest = latestBlob();
    if (!latest) {
      waveNote.textContent = origWave ? `原音 ${origWave.duration.toFixed(1)}s` : '';
      return;
    }
    const mw = await waveOf(latest);
    if (!mw) {
      waveMine.textContent = '这台设备无法显示波形';
      return;
    }
    drawBars(waveMine, mw);
    waveNote.textContent = origWave
      ? `原音 ${origWave.duration.toFixed(1)}s · 我的 ${mw.duration.toFixed(1)}s：${durationFeedback(origWave.duration, mw.duration)}`
      : `我的 ${mw.duration.toFixed(1)}s`;
  }

  // ---------- 讲解摘要 ----------
  const whyCard =
    s.note &&
    h(
      'a',
      { class: 'card why-card', href: `#${base}/${idx}/why` },
      h('span', { class: 'why-head' }, '为什么这样读', h('span', { class: 'ic', html: icon.chevron })),
      h('p', null, s.note),
    );

  const history = h('div', { class: 'history' });

  // ---------- 底部操作区 ----------
  const ctl = (cls: string, label: string, inner: string | Node, onclick: () => void) =>
    h('button', { class: `ctl ${cls}`, type: 'button', onclick }, h('span', { class: 'disc' }, typeof inner === 'string' ? h('span', { class: 'ic', html: inner }) : inner), h('span', { class: 'lbl' }, label));
  const bOrig = ctl('orig', '原音', icon.play, () => toggle('orig', () => [{ blob: orig!, rate: settings.get().rate }]));
  const bMine = ctl('mine', '我的', icon.play, () => toggle('mine', () => [{ blob: latestBlob()! }]));
  const bRec = ctl('rec', '录音', h('span', { class: 'dot' }), onRecord);
  bRec.setAttribute('aria-label', '录音');
  const bCmp = ctl('cmp', '对比', icon.compare, () =>
    toggle('compare', () => [{ blob: orig!, rate: settings.get().rate }, { blob: latestBlob()! }]),
  );
  const recLabel = bRec.querySelector('.lbl')!;

  const markBtn = (m: Mark, label: string, ic: keyof typeof icon) =>
    h(
      'button',
      {
        type: 'button',
        class: `mark-${m}`,
        'aria-pressed': String(mark === m),
        onclick: async () => {
          mark = mark === m ? 'none' : m;
          updateMarks();
          await setMark(courseId, s!.id, mark);
        },
      },
      iconEl(ic),
      label,
    );
  const marks = [markBtn('star', '需加强', 'star'), markBtn('done', '已掌握', 'check')];

  const dock = h(
    'section',
    { class: 'dock', 'aria-label': '跟读控制' },
    h('div', { class: 'dock-row' }, bOrig, bMine, bRec, bCmp),
    h(
      'div',
      { class: 'dock-meta' },
      h('button', { type: 'button', disabled: idx === 0, onclick: () => step(-1) }, '← 上一句'),
      marks[0],
      marks[1],
      h('button', { type: 'button', class: 'next', disabled: idx >= total - 1, onclick: () => step(1) }, '下一句 →'),
    ),
  );

  // ---------- 显示设置（Aa 面板） ----------
  function openDisplay() {
    const panel = openSheet('显示设置');
    const seg = <T extends string | number>(opts: [T, string][], cur: () => T, set: (v: T) => void) => {
      const el = h('div', { class: 'seg', role: 'group' });
      const paint = () => el.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', opts[i][0] === cur()));
      opts.forEach(([v, label]) => el.append(h('button', { type: 'button', onclick: () => (set(v), paint()) }, label)));
      paint();
      return el;
    };
    const sw = (label: string, sub: string, cur: boolean, set: (v: boolean) => void) => {
      const input = h('input', { type: 'checkbox', role: 'switch' }) as HTMLInputElement;
      input.checked = cur;
      input.addEventListener('change', () => set(input.checked));
      return h('label', { class: 'switch-row' }, h('span', null, label, h('span', { class: 'small muted' }, sub)), input);
    };
    panel.append(
      h('h2', null, '显示设置'),
      h(
        'div',
        { class: 'opt-group' },
        h('span', { class: 'opt-label' }, '文本'),
        seg(TEXT_MODES, () => st.textMode, (v) => {
          settings.set({ textMode: v });
          st.textMode = v;
          applyModes();
        }),
      ),
      h(
        'div',
        { class: 'opt-group' },
        h('span', { class: 'opt-label' }, '原音速度'),
        seg<number>([[1, '1.0×'], [0.75, '0.75×']], () => settings.get().rate, (v) => settings.set({ rate: v as 1 | 0.75 })),
      ),
      sw('发音标记', '重读、连读、弱读、闪音、省略', st.showHints, (v) => {
        settings.set({ showHints: v });
        st.showHints = v;
        applyModes();
      }),
      sw('专注模式', '只留句子和按钮', st.focusMode, (v) => {
        settings.set({ focusMode: v });
        st.focusMode = v;
        applyModes();
      }),
    );
  }

  root.classList.add('practice');
  root.append(
    h(
      'header',
      { class: 'topbar' },
      h('a', { class: 'icon-btn', href: `#${base}`, 'aria-label': '返回本组' }, iconEl('back')),
      h('div', { class: 'topbar-title' }, h('strong', null, day.title), h('span', null, `第 ${idx + 1} 句，共 ${total} 句`)),
      h('button', { class: 'icon-btn aa', type: 'button', 'aria-label': '显示设置', onclick: openDisplay }, 'Aa'),
    ),
    h(
      'main',
      { class: 'content' },
      h(
        'div',
        { class: 'dots', 'aria-hidden': 'true' },
        day.sentences.map((x, i) =>
          h('span', { class: i === idx ? 'on' : prog.get(skey(courseId, x.id))?.practiced ? 'done' : '' }),
        ),
      ),
      sentenceBlock,
      waves,
      whyCard,
      history,
    ),
    dock,
  );

  // ---------- 逻辑 ----------
  function latestBlob() {
    const r = recordings[0];
    return r ? new Blob([r.data], { type: r.type }) : null;
  }

  function toggle(tag: string, items: () => { blob: Blob; rate?: number }[]) {
    if (recorder.isRecording) return;
    if (player.playing === tag) return player.stop();
    player.play(items(), tag);
  }

  function step(d: number) {
    if (recorder.isRecording) recorder.stop();
    go(`${base}/${idx + d}`, true);
  }

  function updateMarks() {
    marks[0].setAttribute('aria-pressed', String(mark === 'star'));
    marks[1].setAttribute('aria-pressed', String(mark === 'done'));
  }

  function applyModes() {
    root.classList.toggle('focus', st.focusMode);
    root.classList.toggle('hide-text', st.textMode === 'none');
    root.classList.toggle('hide-zh', st.textMode === 'en' && !!s!.zh);
    root.classList.toggle('marks-on', st.showHints && hasHints);
    text.classList.remove('peek');
    peekHint.textContent = st.textMode === 'none' ? '文本已隐藏 · 点一下偷看' : st.textMode === 'en' ? '点中文区域偷看翻译' : '';
  }

  function updateButtons() {
    const rec = recorder.isRecording;
    const has = recordings.length > 0;
    bOrig.disabled = rec || !orig;
    bMine.disabled = rec || !has;
    bCmp.disabled = rec || !orig || !has;
    bRec.classList.toggle('recording', rec);
    const p = player.playing;
    bOrig.classList.toggle('active', p === 'orig');
    bMine.classList.toggle('active', p === 'mine');
    bCmp.classList.toggle('active', p === 'compare');
    bOrig.querySelector('.disc .ic')!.innerHTML = p === 'orig' ? icon.stop : icon.play;
    bMine.querySelector('.disc .ic')!.innerHTML = p === 'mine' ? icon.stop : icon.play;
    bCmp.querySelector('.disc .ic')!.innerHTML = p === 'compare' ? icon.stop : icon.compare;
  }

  function renderHistory() {
    if (recordings.length < 2) {
      history.replaceChildren();
      return;
    }
    history.replaceChildren(
      ...recordings.map((r, i) => {
        const tag = `hist-${r.id}`;
        return h(
          'button',
          {
            type: 'button',
            class: `chip${player.playing === tag ? ' active' : ''}`,
            onclick: () => toggle(tag, () => [{ blob: new Blob([r.data], { type: r.type }) }]),
          },
          h('span', { class: 'ic', html: player.playing === tag ? icon.stop : icon.play }),
          `${i === 0 ? '最新' : `#${i + 1}`} · ${r.duration.toFixed(1)}s · ${fmtAgo(r.createdAt)}`,
        );
      }),
    );
  }

  let tick: number | undefined;
  async function onRecord() {
    if (recorder.isRecording) {
      recorder.stop();
      return;
    }
    if (!recorder.supported) {
      toast('当前浏览器不支持录音（需要 HTTPS + Safari 14.5 以上）', 3500);
      return;
    }
    try {
      const done = recorder.start(() => toast('已达 30 秒上限，自动停止'));
      tick = window.setInterval(renderTimer, 100);
      const res = await done;
      clearInterval(tick);
      if (res.duration < 0.3 || res.blob.size === 0) {
        toast('录音太短，没有保存');
      } else {
        await addRecording(courseId, s!.id, res.blob, res.duration);
        recordings = await listRecordings(courseId, s!.id);
        renderWaves();
      }
    } catch (e: any) {
      clearInterval(tick);
      toast(e?.name === 'NotAllowedError' ? '没有麦克风权限：请在「设置 → Safari → 麦克风」里允许' : `录音失败：${e?.message ?? e}`, 4000);
    } finally {
      recLabel.textContent = '录音';
      updateButtons();
      renderHistory();
    }
  }

  function renderTimer() {
    if (!recorder.isRecording) return;
    recLabel.textContent = `${(recorder.elapsedMs / 1000).toFixed(1)}s / ${MAX_RECORD_MS / 1000}s`;
    updateButtons();
  }

  // 左右滑动切句（单手操作）
  let sx = 0;
  let sy = 0;
  const main = root.querySelector('main')!;
  main.addEventListener('touchstart', (e) => ((sx = e.touches[0].clientX), (sy = e.touches[0].clientY)), { passive: true });
  main.addEventListener(
    'touchend',
    (e) => {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0 && idx < total - 1) step(1);
        else if (dx > 0 && idx > 0) step(-1);
      }
    },
    { passive: true },
  );

  const off = player.onChange(() => {
    updateButtons();
    renderHistory();
  });

  if (!orig) toast('这句的音频缺失，请重新导入课程包', 3500);
  applyModes();
  updateMarks();
  updateButtons();
  renderHistory();
  renderWaves();

  return () => {
    off();
    clearInterval(tick);
    if (recorder.isRecording) recorder.stop();
  };
}
