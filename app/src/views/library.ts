// 句子课程库：内置样例课 + 导入的课程包，可删除。
import { dismissBuiltin, ensureBuiltinCourse } from '../content';
import { deleteCourse, listCourses, progressMap, type Course } from '../db';
import { importPack } from '../importer';
import { enc } from '../nav';
import { h, iconEl, toast } from '../ui';

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
    // 内置课排在最前，其余按导入时间倒序
    const courses = (await listCourses()).sort(
      (a, b) => Number(!!b.builtin) - Number(!!a.builtin) || b.imported_at - a.imported_at,
    );
    if (!courses.length) {
      list.replaceChildren(
        h(
          'div',
          { class: 'empty' },
          h('p', { class: 'empty-title' }, '还没有课程'),
          h('p', null, '点上面的「导入课程包」，从「文件」App 里选择 .zip 课程包。'),
          h(
            'button',
            { class: 'btn', type: 'button', onclick: async () => (dismissBuiltin(false), await ensureBuiltinCourse(), renderList()) },
            '恢复内置样例课',
          ),
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
          if (c.builtin) dismissBuiltin(true);
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
        h('div', { class: 'row-title' }, c.title, c.builtin && h('span', { class: 'tag' }, '内置')),
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
      h('a', { class: 'icon-btn', href: '#/', 'aria-label': '返回首页' }, iconEl('back')),
      h('h1', null, '句子'),
      h('span', { class: 'icon-btn-spacer' }),
    ),
    h(
      'main',
      { class: 'content' },
      h('label', { class: 'btn primary block' }, iconEl('plus'), '导入课程包', input),
      status,
      list,
    ),
  );
  await renderList();
  // 第一次进来时自动装上内置样例课
  try {
    status.hidden = false;
    if (await ensureBuiltinCourse((m) => (status.textContent = m))) await renderList();
  } catch (e: any) {
    toast(`样例课加载失败：${e?.message ?? e}`, 3500);
  } finally {
    status.hidden = true;
  }
}

export function progressBar(done: number, total: number) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': pct }, h('span', { style: { width: `${pct}%` } }));
}
