// 学习首页（原型 Main）：接着上次、学习路径、需要加强。
import { tabbar } from '../components/tabbar';
import { BUILTIN_SENTENCES, ensureBuiltinCourse, loadIpa } from '../content';
import { allProgress, getCourse, listCourses, streakDays, type Course } from '../db';
import { enc } from '../nav';
import { settings } from '../settings';
import { h, icon, iconEl, isStandalone } from '../ui';
import { IPA_COURSE } from './ipa';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export async function homeView(root: HTMLElement) {
  root.classList.add('has-tabbar');
  // 内置样例课：首次进入就装好（「接着上次」才有内容）；已装过就在后台检查更新，不阻塞首页
  if (await getCourse(BUILTIN_SENTENCES.id)) ensureBuiltinCourse().catch(() => false);
  else await ensureBuiltinCourse().catch(() => false);

  const [progress, courses, ipa] = await Promise.all([allProgress(), listCourses(), loadIpa().catch(() => null)]);
  const practiced = new Set(progress.filter((p) => p.practiced > 0).map((p) => p.skey));

  const now = new Date();
  const streak = streakDays();

  root.append(
    h(
      'main',
      { class: 'content' },
      h(
        'header',
        { class: 'page-head' },
        h(
          'div',
          null,
          h('div', { class: 'eyebrow' }, `${now.getMonth() + 1} 月 ${now.getDate()} 日 · 周${WEEK[now.getDay()]}`),
          h('h1', null, '今天读什么'),
        ),
        streak > 0 && h('div', { class: 'streak' }, h('b', null, streak), '天连续'),
      ),
      !isStandalone() &&
        h('p', { class: 'notice' }, '在 Safari 里点「分享」→「添加到主屏幕」，从主屏幕打开：数据不容易被系统清理，也能离线练习。'),
      await continueCard(courses, practiced),
      h(
        'section',
        { class: 'section' },
        h('h2', { class: 'section-title' }, '学习路径'),
        h(
          'div',
          { class: 'list' },
          path('#/ipa', 'æ', true, '音标', ipa ? `${ipa.phonemes.length} 个美音音素 · 已练 ${ipaPracticed(ipa.phonemes, practiced)} 个` : '美音音素'),
          path('#/sentences', 'a‿i', false, '句子', sentenceSub(courses, practiced)),
          h(
            'div',
            { class: 'row path soon' },
            h('span', { class: 'path-sym' }, '¶'),
            h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, '段落'), h('span', { class: 'row-sub' }, '整段跟读与语调 · 筹备中')),
          ),
        ),
      ),
      await weakSection(progress),
      h('a', { class: 'search-entry', href: '#/dict' }, h('span', { class: 'ic', html: icon.search }), '查单词：美音音标、中文释义'),
    ),
    tabbar('learn'),
  );
}

function path(href: string, sym: string, isIpa: boolean, title: string, sub: string) {
  return h(
    'a',
    { class: 'row path', href },
    h('span', { class: `path-sym${isIpa ? ' ipa' : ''}`, lang: 'en' }, sym),
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, title), h('span', { class: 'row-sub' }, sub)),
    h('span', { class: 'ic chev', html: icon.chevron }),
  );
}

function ipaPracticed(phonemes: { id: string; words: { w: string }[] }[], practiced: Set<string>) {
  return phonemes.filter((p) => p.words.some((w) => practiced.has(`${IPA_COURSE}/${p.id}:${w.w}`))).length;
}

function sentenceSub(courses: Course[], practiced: Set<string>) {
  const sample = courses.find((c) => c.course_id === BUILTIN_SENTENCES.id);
  const others = courses.length - (sample ? 1 : 0);
  if (!sample) return others ? `${others} 门课程` : '跟读对比，带连读弱读提示';
  const total = sample.days.reduce((n, d) => n + d.sentences.length, 0);
  const done = sample.days.reduce((n, d) => n + d.sentences.filter((s) => practiced.has(`${sample.course_id}/${s.id}`)).length, 0);
  return `${sample.title} · ${done}/${total}` + (others ? ` · 另有 ${others} 门课程` : '');
}

/** 「接着上次」：上次练的那一句；没有就从样例课第一句开始 */
async function continueCard(courses: Course[], practiced: Set<string>) {
  const last = settings.get().last;
  let course = last ? await getCourse(last.courseId) : undefined;
  let day = course?.days.find((d) => d.day === last!.day);
  let idx = last?.idx ?? 0;
  if (!course || !day || !day.sentences[idx]) {
    course = courses.find((c) => c.course_id === BUILTIN_SENTENCES.id) ?? courses[0];
    day = course?.days[0];
    idx = 0;
  }
  if (!course || !day) {
    return h(
      'a',
      { class: 'card continue', href: '#/sentences' },
      h('div', { class: 'continue-meta' }, h('span', null, '还没有课程')),
      h('p', { class: 'continue-en' }, '从句子开始'),
    );
  }
  const s = day.sentences[idx];
  const done = day.sentences.filter((x) => practiced.has(`${course!.course_id}/${x.id}`)).length;
  return h(
    'a',
    { class: 'card continue', href: `#/c/${enc(course.course_id)}/d/${day.day}/${idx}` },
    h('div', { class: 'continue-meta' }, h('span', null, `${last ? '接着上次' : '从这里开始'} · ${day.title}`), h('span', null, `${idx + 1} / ${day.sentences.length}`)),
    h('p', { class: 'continue-en', lang: 'en' }, s.text),
    s.zh && h('p', { class: 'muted' }, s.zh),
    h(
      'div',
      { class: 'continue-foot' },
      h('div', { class: 'bar' }, h('span', { style: { width: `${Math.round((done / day.sentences.length) * 100)}%` } })),
      h('span', { class: 'btn ink' }, last ? '继续练习' : '开始练习', iconEl('chevron')),
    ),
  );
}

/** 「需要加强」：标了星的句子，最近的两条 */
async function weakSection(progress: { skey: string; courseId: string; mark: string; updatedAt: number }[]) {
  const starred = progress.filter((p) => p.mark === 'star').sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 2);
  if (!starred.length) return null;
  const cards = [];
  for (const p of starred) {
    const course = await getCourse(p.courseId);
    const sid = p.skey.slice(p.courseId.length + 1);
    for (const d of course?.days ?? []) {
      const i = d.sentences.findIndex((s) => s.id === sid);
      if (i >= 0) {
        cards.push(
          h(
            'a',
            { class: 'weak-card', href: `#/c/${enc(p.courseId)}/d/${d.day}/${i}` },
            h('span', { class: 'en', lang: 'en' }, d.sentences[i].text),
            h('span', { class: 'small muted' }, d.title),
          ),
        );
        break;
      }
    }
  }
  if (!cards.length) return null;
  return h('section', { class: 'section' }, h('h2', { class: 'section-title' }, '需要加强'), h('div', { class: 'weak-cards' }, cards));
}
