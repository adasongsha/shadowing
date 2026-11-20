// 首页 / 课程库：导入课程包、列出已导入课程、删除。
import { deleteCourse, listCourses, progressMap, type Course } from '../db';
import { importPack } from '../importer';
import { enc } from '../nav';
import { h, iconEl, isStandalone, toast } from '../ui';

export async function libraryView(root: HTMLElement) {
  const list = h('div', { class: 'list' });
  const status = h('div', { class: 'import-status', hidden: true });

  const input = h('input', { type: 'file', accept: '.zip,application/zip', class: 'visually-hidden' }) as HTMLInputElement;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    status.hidden = false;
    try {
      const r = await importPack(file, (m) => (status.textContent = m));
      toast(`${r.merged ? '已合并' : '已导入'}「${r.title}」：${r.days} 天 / ${r.sentences} 句`, 3000);
      await renderList();
    } catch (e: any) {
      toast(`导入失败：${e?.message ?? e}`, 4000);
    } finally {
      status.hidden = true;
    }
  });

  async function renderList() {
    const courses = (await listCourses()).sort((a, b) => b.imported_at - a.imported_at);
    if (!courses.length) {
      list.replaceChildren(
        h(
          'div',
          { class: 'empty' },
          h('p', { class: 'empty-title' }, '还没有课程'),
          h('p', null, '点上面的「导入课程包」，从「文件」App 里选择 .zip 课程包。'),
        ),
      );
      return;
    }
    const rows = await Promise.all(courses.map(courseRow));
    list.replaceChildren(...rows);
  }

  async function courseRow(c: Course) {
    const total = c.days.reduce((n, d) => n + d.sentences.length, 0);
    const prog = await progressMap(c.course_id);
    const practiced = [...prog.values()].filter((p) => p.practiced > 0).length;
    const del = h(
      'button',
      {
        class: 'icon-btn danger',
        'aria-label': '删除课程',
        onclick: async (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          if (!confirm(`删除「${c.title}」？课程音频和你的录音都会从本机删除。`)) return;
          await deleteCourse(c.course_id);
          toast('已删除');
          renderList();
        },
      },
      iconEl('trash'),
    );
    return h(
      'a',
      { class: 'row card', href: `#/c/${enc(c.course_id)}` },
      h(
        'div',
        { class: 'row-main' },
        h('div', { class: 'row-title' }, c.title),
        h('div', { class: 'row-sub' }, `${c.days.length} 天 · ${total} 句 · 已练 ${practiced}`),
        progressBar(practiced, total),
      ),
      del,
    );
  }

  root.append(
    h(
      'header',
      { class: 'topbar' },
      h('h1', null, '跟读对比'),
      h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': '设置' }, iconEl('gear')),
    ),
    h(
      'main',
      { class: 'content' },
      !isStandalone() &&
        h('div', { class: 'hint' }, '建议在 Safari 里点「分享」→「添加到主屏幕」，从主屏幕打开使用：数据更不容易被系统清理，也能离线练习。'),
      h('label', { class: 'btn primary block' }, iconEl('plus'), '导入课程包', input),
      status,
      list,
    ),
  );
  await renderList();
}

export function progressBar(done: number, total: number) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': pct }, h('span', { style: { width: `${pct}%` } }));
}
