// 紧凑版跟读按钮组（原音 / 录音，录过以后出现 我的 / 对比），用在音标页的例词上。
// 句子练习页功能更多（波形、历史录音、标记、倍速），用 views/practice.ts 自己的实现。
import { player, recorder } from '../audio';
import { addRecording, listRecordings } from '../db';
import { fetchBlob } from '../content';
import { h, icon, toast } from '../ui';

export function shadowRow(courseId: string, itemId: string, origPath: string) {
  let orig: Blob | null = null;
  let mine: Blob | null = null;
  fetchBlob(origPath).then((b) => ((orig = b), update()), () => toast('音频加载失败，请检查网络'));
  listRecordings(courseId, itemId).then((rs) => {
    if (rs[0]) mine = new Blob([rs[0].data], { type: rs[0].type });
    update();
  });

  const tag = (t: string) => `${courseId}/${itemId}/${t}`;
  const mk = (cls: string, ic: string, label: string, onclick: () => void) =>
    h('button', { class: `mini ${cls}`, type: 'button', 'aria-label': label, onclick, html: ic });

  const bOrig = mk('orig', icon.play, '原音', () => toggle('orig', () => (orig ? [{ blob: orig }] : [])));
  const DOT = '<span class="dot"></span>';
  const bRec = mk('rec', DOT, '跟读录音', onRec);
  const bMine = mk('mine', icon.play, '我的录音', () => toggle('mine', () => (mine ? [{ blob: mine }] : [])));
  const bCmp = mk('cmp', icon.compare, '对比', () =>
    toggle('cmp', () => (orig && mine ? [{ blob: orig }, { blob: mine }] : [])),
  );
  const el = h('div', { class: 'mini-row' }, bOrig, bRec, bMine, bCmp);

  function toggle(t: string, items: () => { blob: Blob }[]) {
    if (recorder.isRecording) return;
    if (player.playing === tag(t)) return player.stop();
    const list = items();
    if (list.length) player.play(list, tag(t), 300);
  }

  async function onRec() {
    if (recorder.isRecording) return recorder.stop();
    if (!recorder.supported) return toast('当前浏览器不支持录音');
    try {
      const done = recorder.start();
      recording = true;
      update();
      const res = await done;
      if (res.duration >= 0.3 && res.blob.size) {
        mine = res.blob;
        await addRecording(courseId, itemId, res.blob, res.duration);
      } else toast('录音太短，没有保存');
    } catch (e: any) {
      toast(e?.name === 'NotAllowedError' ? '没有麦克风权限' : `录音失败：${e?.message ?? e}`, 3500);
    } finally {
      recording = false;
      update();
    }
  }

  let recording = false;
  function update() {
    const p = player.playing;
    bOrig.disabled = recording || !orig;
    bMine.disabled = recording || !mine;
    bCmp.disabled = recording || !orig || !mine;
    bRec.disabled = !!recorder.isRecording && !recording; // 别处在录音时禁用
    bRec.classList.toggle('recording', recording);
    bRec.innerHTML = DOT;
    bMine.hidden = !mine;
    bCmp.hidden = !mine;
    bOrig.innerHTML = p === tag('orig') ? icon.stop : icon.play;
    bMine.innerHTML = p === tag('mine') ? icon.stop : icon.play;
    bCmp.innerHTML = p === tag('cmp') ? icon.stop : icon.compare;
    for (const [b, t] of [[bOrig, 'orig'], [bMine, 'mine'], [bCmp, 'cmp']] as const) b.classList.toggle('active', p === tag(t));
  }
  const off = player.onChange(update);
  update();
  return { el, dispose: () => off() };
}
