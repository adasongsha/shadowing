// 我的：练习统计、生词本入口、存储、录音导出与清除、麦克风选项、素材来源。
import JSZip from 'jszip';
import { tabbar } from '../components/tabbar';
import { allProgress, allRecordings, clearAllRecordings, listCourses, listWords, streakDays, totalPracticeDays } from '../db';
import { settings } from '../settings';
import { fmtBytes, h, icon, isStandalone, toast } from '../ui';

export async function meView(root: HTMLElement) {
  root.classList.add('has-tabbar');
  const storageInfo = h('div', { class: 'kv' });

  async function refreshStorage() {
    const est = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();
    const recs = await allRecordings();
    const recBytes = recs.reduce((n, r) => n + r.data.byteLength, 0);
    storageInfo.replaceChildren(
      kv('已用空间', est?.usage != null ? fmtBytes(est.usage) : '未知'),
      kv('可用配额', est?.quota != null ? fmtBytes(est.quota) : '未知'),
      kv('我的录音', `${recs.length} 条 · ${fmtBytes(recBytes)}`),
      kv('持久化存储', persisted ? '已开启' : '未开启（建议添加到主屏幕使用）'),
      kv('运行方式', isStandalone() ? '主屏幕 App' : '浏览器标签页'),
    );
  }

  const micToggle = h('input', { type: 'checkbox', role: 'switch' }) as HTMLInputElement;
  micToggle.checked = settings.get().releaseMicAfterRecord;
  micToggle.addEventListener('change', () => settings.set({ releaseMicAfterRecord: micToggle.checked }));

  const [progress, words] = await Promise.all([allProgress(), listWords()]);
  const totalRecs = progress.reduce((n, p) => n + p.practiced, 0);
  const stat = (n: number, label: string) => h('div', { class: 'stat' }, h('b', null, n), h('span', null, label));
  const linkRow = (href: string, title: string, sub?: string) =>
    h(
      'a',
      { class: 'row', href },
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, title), sub && h('span', { class: 'row-sub' }, sub)),
      h('span', { class: 'ic chev', html: icon.chevron }),
    );

  root.append(
    h(
      'main',
      { class: 'content' },
      h('header', { class: 'page-head' }, h('h1', null, '我的')),
      h('div', { class: 'stats' }, stat(streakDays(), '连续天数'), stat(totalPracticeDays(), '累计天数'), stat(totalRecs, '累计录音')),
      h(
        'div',
        { class: 'list' },
        linkRow('#/dict', '生词本', `${words.length} 个词`),
        linkRow('#/sentences', '我的课程', '内置样例课和导入的课程包'),
      ),
      h('section', { class: 'section' }, h('h2', { class: 'section-title' }, '存储'), h('div', { class: 'card pad' }, storageInfo)),
      h(
        'section',
        { class: 'section' },
        h('h2', { class: 'section-title' }, '录音'),
        h(
          'div',
          { class: 'card pad', style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
          h(
            'label',
            { class: 'switch-row' },
            h(
              'span',
              null,
              '录完立即释放麦克风',
              h('span', { class: 'small muted' }, '默认关闭：整个练习过程复用麦克风，避免反复弹权限。如果录完回放声音很小（像从听筒出来），打开它试试。'),
            ),
            micToggle,
          ),
          h('button', { class: 'btn block', style: { background: 'var(--surface-2)' }, type: 'button', onclick: exportRecordings }, '导出我的录音（zip）'),
          h(
            'button',
            {
              class: 'btn block danger',
              style: { background: 'var(--surface-2)' },
              type: 'button',
              onclick: async () => {
                if (!confirm('清除所有录音？练习次数和标记会保留。')) return;
                await clearAllRecordings();
                toast('录音已清除');
                refreshStorage();
              },
            },
            '清除所有录音',
          ),
        ),
      ),
      h('div', { class: 'list' }, linkRow('#/credits', '素材来源与许可')),
      h('p', { class: 'small muted center' }, '课程音频和你的录音只保存在这台设备上，不会上传到任何服务器。'),
    ),
    tabbar('me'),
  );
  await refreshStorage();

  async function exportRecordings() {
    const recs = await allRecordings();
    if (!recs.length) return toast('还没有录音');
    toast('打包中…');
    const courses = new Map((await listCourses()).map((c) => [c.course_id, c]));
    const zip = new JSZip();
    for (const r of recs) {
      const [cid, sid] = [r.courseId, r.skey.slice(r.courseId.length + 1)];
      const ext = r.type.includes('webm') ? 'webm' : 'm4a';
      const ts = new Date(r.createdAt).toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const title = courses.get(cid)?.title ?? cid;
      zip.file(`${title}/${sid}_${ts}.${ext}`, r.data);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const name = `我的录音_${new Date().toISOString().slice(0, 10)}.zip`;
    const file = new File([blob], name, { type: 'application/zip' });
    // iOS 上优先用系统分享面板（可以「存储到文件」或 AirDrop）
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
      }
    }
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }
}

function kv(k: string, v: string) {
  return h('div', { class: 'kv-row' }, h('span', { class: 'muted' }, k), h('span', null, v));
}
