// 句子练习页（核心）：原音 / 录音 / 我的 / 对比，倍速，标记，历史录音，专注模式。
import { player, recorder, MAX_RECORD_MS } from '../audio';
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
import { renderSentence } from '../components/richtext';
import { openWordCard } from '../components/wordcard';
import { enc, go } from '../nav';
import { settings, type TextMode } from '../settings';
import { fmtAgo, h, icon, iconEl, toast } from '../ui';

export async function practiceView(root: HTMLElement, [courseId, dayStr, idxStr]: string[]) {
  const course = await getCourse(courseId);
  const day = course?.days.find((d) => d.day === Number(dayStr));
  const idx = Number(idxStr);
  const s = day?.sentences[idx];
  if (!course || !day || !s) {
    location.hash = `#/c/${enc(courseId)}`;
    return;
  }

  const base = `/c/${enc(courseId)}/d/${day.day}`;
  const total = day.sentences.length;
  const [orig, recs, prog] = await Promise.all([
    getAudio(courseId, s.id),
    listRecordings(courseId, s.id),
    progressMap(courseId),
  ]);
  let recordings: Recording[] = recs;
  let mark: Mark = prog.get(skey(courseId, s.id))?.mark ?? 'none';
  const st = settings.get();

  // ---------- 元素 ----------
  const btn = (cls: string, ic: string, label: string, onclick: () => void) =>
    h('button', { class: `ctl ${cls}`, type: 'button', onclick }, h('span', { class: 'ic', html: ic }), h('span', { class: 'lbl' }, label));

  const bOrig = btn('orig', icon.play, '原音', () => toggle('orig', () => [{ blob: orig!, rate: settings.get().rate }]));
  const bMine = btn('mine', icon.play, '我的', () => toggle('mine', () => [{ blob: latestBlob()! }]));
  const bRec = btn('rec', icon.mic, '录音', onRecord);
  const bCmp = btn('cmp', icon.compare, '对比', () =>
    toggle('compare', () => [{ blob: orig!, rate: settings.get().rate }, { blob: latestBlob()! }]),
  );
  const recLabel = bRec.querySelector('.lbl')!;
  const recIcon = bRec.querySelector('.ic')!;

  const hasHints = !!s.hints?.length;
  const text = h(
    'div',
    { class: 'sentence-text' },
    h('p', { class: 'sentence', lang: 'en' }, renderSentence(s.text, s.hints, (t) => openWordCard(t.word, t.hints))),
    s.zh && h('p', { class: 'translation' }, s.zh),
  );
  const textWrap = h('div', { class: 'sentence-wrap' }, text);
  // 捕获阶段处理「偷看」：文本被隐藏时，第一下点击只是显示出来，不触发查词
  textWrap.addEventListener(
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
  const peekHint = h('p', { class: 'peek-hint' });
  textWrap.append(peekHint);

  const rateSeg = h(
    'div',
    { class: 'seg', role: 'group', 'aria-label': '原音倍速' },
    ...([0.75, 1] as const).map((r) =>
      h(
        'button',
        {
          type: 'button',
          class: st.rate === r ? 'on' : '',
          onclick: (e: Event) => {
            settings.set({ rate: r });
            rateSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
          },
        },
        r === 1 ? '1.0×' : '0.75×',
      ),
    ),
  );

  const markBtn = (m: Mark, ic: keyof typeof icon, label: string) =>
    h(
      'button',
      {
        type: 'button',
        class: `mark mark-${m}`,
        'aria-pressed': String(mark === m),
        onclick: async () => {
          mark = mark === m ? 'none' : m;
          updateMarks();
          await setMark(courseId, s.id, mark);
        },
      },
      iconEl(ic),
      label,
    );
  const marks = [markBtn('star', 'star', '需加强'), markBtn('done', 'check', '已掌握')];

  const history = h('div', { class: 'history' });

  // 文本显示三档循环：全部显示 → 隐藏中文 → 全部隐藏
  const MODES: Record<TextMode, { next: TextMode; badge: string; label: string; toast: string }> = {
    all: { next: 'en', badge: '', label: '文本：全部显示', toast: '显示英文和中文' },
    en: { next: 'none', badge: '英', label: '文本：只显示英文', toast: '已隐藏中文翻译' },
    none: { next: 'all', badge: '', label: '文本：全部隐藏', toast: '已隐藏全部文本（纯听）' },
  };
  const textModeBtn = h('button', {
    class: 'icon-btn text-mode',
    type: 'button',
    onclick: () => {
      settings.set({ textMode: MODES[st.textMode].next });
      st.textMode = settings.get().textMode;
      toast(MODES[st.textMode].toast, 1500);
      applyModes();
    },
  });

  const hintBtn =
    hasHints &&
    h('button', {
      class: 'icon-btn',
      type: 'button',
      'aria-label': '连读弱读提示',
      'aria-pressed': String(st.showHints),
      html: icon.hint,
      onclick: (e: Event) => {
        settings.set({ showHints: !settings.get().showHints });
        st.showHints = settings.get().showHints;
        (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(st.showHints));
        toast(st.showHints ? '显示连读、弱读提示（点单词看说明）' : '已关闭发音提示', 1500);
        applyModes();
      },
    });

  const toggles = h(
    'div',
    { class: 'topbar-actions' },
    hintBtn,
    textModeBtn,
    h(
      'button',
      {
        class: 'icon-btn',
        type: 'button',
        'aria-label': '专注模式',
        'aria-pressed': String(st.focusMode),
        onclick: (e: Event) => {
          settings.set({ focusMode: !settings.get().focusMode });
          st.focusMode = settings.get().focusMode;
          (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(st.focusMode));
          applyModes();
        },
        html: icon.focus,
      },
    ),
  );

  const nav = h(
    'nav',
    { class: 'pager' },
    h('button', { class: 'btn', type: 'button', disabled: idx === 0, onclick: () => step(-1) }, iconEl('prev'), '上一句'),
    h('span', { class: 'pager-pos' }, `${idx + 1} / ${total}`),
    h('button', { class: 'btn', type: 'button', disabled: idx >= total - 1, onclick: () => step(1) }, '下一句', iconEl('next')),
  );

  const card = h(
    'section',
    { class: 'practice-card' },
    textWrap,
    h('div', { class: 'controls' }, bOrig, bMine, bRec, bCmp),
    h('div', { class: 'options' }, rateSeg, h('div', { class: 'marks' }, marks)),
    history,
  );

  root.classList.add('practice');
  root.append(
    h(
      'header',
      { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#' + base, 'aria-label': '返回句子列表' }, iconEl('back')),
      h('h1', null, `${day.title}`),
      toggles,
    ),
    h('main', { class: 'content' }, card),
    nav,
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
    root.classList.toggle('show-hints', st.showHints && hasHints);
    text.classList.remove('peek');
    const m = MODES[st.textMode];
    textModeBtn.innerHTML = (st.textMode === 'none' ? icon.eyeOff : icon.eye) + (m.badge ? `<span class="mode-badge">${m.badge}</span>` : '');
    textModeBtn.setAttribute('aria-label', m.label);
    textModeBtn.setAttribute('aria-pressed', String(st.textMode !== 'all'));
    peekHint.textContent =
      st.textMode === 'none' ? '文本已隐藏 · 点一下偷看' : st.textMode === 'en' ? '点中文区域偷看翻译' : '点单词可以查词';
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
    bOrig.querySelector('.ic')!.innerHTML = p === 'orig' ? icon.stop : icon.play;
    bMine.querySelector('.ic')!.innerHTML = p === 'mine' ? icon.stop : icon.play;
    bCmp.querySelector('.ic')!.innerHTML = p === 'compare' ? icon.stop : icon.compare;
  }

  function renderHistory() {
    if (!recordings.length) {
      history.replaceChildren(h('p', { class: 'muted small' }, '还没有录音。听一遍原音，然后点「录音」跟读。'));
      return;
    }
    history.replaceChildren(
      h('p', { class: 'muted small' }, `最近 ${recordings.length} 次录音（最多保留 3 次）`),
      h(
        'div',
        { class: 'chips' },
        recordings.map((r, i) => {
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
      ),
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
      // 等 start 内部的 getUserMedia 完成后才真正开始；先更新 UI
      tick = window.setInterval(renderTimer, 100);
      const res = await done;
      clearInterval(tick);
      if (res.duration < 0.3 || res.blob.size === 0) {
        toast('录音太短，没有保存');
      } else {
        await addRecording(courseId, s!.id, res.blob, res.duration);
        recordings = await listRecordings(courseId, s!.id);
      }
    } catch (e: any) {
      clearInterval(tick);
      const msg =
        e?.name === 'NotAllowedError'
          ? '没有麦克风权限：请在「设置 → Safari → 麦克风」里允许'
          : `录音失败：${e?.message ?? e}`;
      toast(msg, 4000);
    } finally {
      recLabel.textContent = '录音';
      recIcon.innerHTML = icon.mic;
      updateButtons();
      renderHistory();
    }
  }

  function renderTimer() {
    if (!recorder.isRecording) return;
    const ms = recorder.elapsedMs;
    recIcon.innerHTML = icon.stop;
    recLabel.textContent = `停止 ${(ms / 1000).toFixed(1)}s / ${MAX_RECORD_MS / 1000}s`;
    updateButtons();
  }

  // 左右滑动切句（单手操作）
  let sx = 0;
  let sy = 0;
  card.addEventListener('touchstart', (e) => ((sx = e.touches[0].clientX), (sy = e.touches[0].clientY)), { passive: true });
  card.addEventListener(
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

  return () => {
    off();
    clearInterval(tick);
    if (recorder.isRecording) recorder.stop();
  };
}
