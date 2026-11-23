// IndexedDB 存储层。
// 音频统一存成 ArrayBuffer + MIME（而不是 Blob），规避旧版 iOS Safari 在 IndexedDB 里存 Blob 的兼容问题。
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/** 重读 / 连读 / 弱读 / 闪音 / 省略 提示；from/to 是英文原文里的字符位置（左闭右开） */
export interface Hint {
  type: 'stress' | 'link' | 'weak' | 'flap' | 'elide';
  from: number;
  to: number;
  note?: string;
}

export interface Sentence {
  id: string;
  text: string;
  /** 中文翻译（可选） */
  zh?: string;
  audio: string;
  duration?: number;
  /** 发音提示（可选） */
  hints?: Hint[];
  /** 这一句的讲解：想表达什么、发音为什么这样变（可选） */
  note?: string;
}

/** 一组（一天）的讲解：是什么 / 为什么会这样 / 怎么练 */
export interface DayIntro {
  what?: string;
  why?: string;
  how?: string;
}

export interface Day {
  day: number;
  title: string;
  intro?: DayIntro;
  sentences: Sentence[];
}

export interface Course {
  course_id: string;
  title: string;
  created_at?: string;
  imported_at: number;
  /** App 内置的公开课程（不是用户导入的） */
  builtin?: boolean;
  /** 内置课程的内容版本，用于自动更新 */
  version?: string;
  days: Day[];
}

export interface StoredAudio {
  key: string; // `${courseId}/${sentenceId}`
  courseId: string;
  data: ArrayBuffer;
  type: string;
}

export interface Recording {
  id?: number;
  skey: string; // `${courseId}/${sentenceId}`
  courseId: string;
  createdAt: number;
  duration: number;
  data: ArrayBuffer;
  type: string;
}

export type Mark = 'none' | 'star' | 'done';

export interface Progress {
  skey: string;
  courseId: string;
  practiced: number; // 录音次数（累计）
  mark: Mark;
  updatedAt: number;
}

/** 生词本条目 */
export interface WordEntry {
  word: string;
  ipa: string;
  zh: string;
  addedAt: number;
}

interface Schema extends DBSchema {
  courses: { key: string; value: Course };
  audio: { key: string; value: StoredAudio; indexes: { byCourse: string } };
  recordings: {
    key: number;
    value: Recording;
    indexes: { bySentence: string; byCourse: string };
  };
  progress: { key: string; value: Progress; indexes: { byCourse: string } };
  words: { key: string; value: WordEntry };
}

export const MAX_RECORDINGS = 3;

let dbp: Promise<IDBPDatabase<Schema>> | null = null;

export function db() {
  if (!dbp) {
    dbp = openDB<Schema>('shadowing', 2, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          d.createObjectStore('courses', { keyPath: 'course_id' });
          d.createObjectStore('audio', { keyPath: 'key' }).createIndex('byCourse', 'courseId');
          const r = d.createObjectStore('recordings', { keyPath: 'id', autoIncrement: true });
          r.createIndex('bySentence', 'skey');
          r.createIndex('byCourse', 'courseId');
          d.createObjectStore('progress', { keyPath: 'skey' }).createIndex('byCourse', 'courseId');
        }
        // v2：生词本
        if (oldVersion < 2) d.createObjectStore('words', { keyPath: 'word' });
      },
    });
  }
  return dbp;
}

export const skey = (courseId: string, sentenceId: string) => `${courseId}/${sentenceId}`;

// ---------- 课程 ----------

export async function listCourses() {
  return (await db()).getAll('courses');
}

export async function getCourse(id: string) {
  return (await db()).get('courses', id);
}

export async function deleteCourse(id: string) {
  const d = await db();
  const tx = d.transaction(['courses', 'audio', 'recordings', 'progress'], 'readwrite');
  await tx.objectStore('courses').delete(id);
  for (const store of ['audio', 'recordings', 'progress'] as const) {
    let cur = await tx.objectStore(store).index('byCourse').openKeyCursor(id);
    while (cur) {
      await tx.objectStore(store).delete(cur.primaryKey);
      cur = await cur.continue();
    }
  }
  await tx.done;
}

export async function getAudio(courseId: string, sentenceId: string) {
  const a = await (await db()).get('audio', skey(courseId, sentenceId));
  return a ? new Blob([a.data], { type: a.type }) : null;
}

// ---------- 录音 ----------

export async function listRecordings(courseId: string, sentenceId: string) {
  const all = await (await db()).getAllFromIndex('recordings', 'bySentence', skey(courseId, sentenceId));
  return all.sort((a, b) => b.createdAt - a.createdAt); // 最新在前
}

/** 保存一条录音，只保留最近 MAX_RECORDINGS 条，并累计练习次数 */
export async function addRecording(courseId: string, sentenceId: string, blob: Blob, duration: number) {
  const data = await blob.arrayBuffer();
  const k = skey(courseId, sentenceId);
  const d = await db();
  const tx = d.transaction(['recordings', 'progress'], 'readwrite');
  const rs = tx.objectStore('recordings');
  await rs.add({ skey: k, courseId, createdAt: Date.now(), duration, data, type: blob.type });
  const existing = (await rs.index('bySentence').getAll(k)).sort((a, b) => b.createdAt - a.createdAt);
  for (const old of existing.slice(MAX_RECORDINGS)) await rs.delete(old.id!);
  const ps = tx.objectStore('progress');
  const p = (await ps.get(k)) ?? { skey: k, courseId, practiced: 0, mark: 'none' as Mark, updatedAt: 0 };
  p.practiced += 1;
  p.updatedAt = Date.now();
  await ps.put(p);
  await tx.done;
  markPracticedToday();
}

export async function clearAllRecordings() {
  await (await db()).clear('recordings');
}

export async function allRecordings() {
  return (await db()).getAll('recordings');
}

// ---------- 进度 / 标记 ----------

/** 所有课程（含音标）的进度，用于首页和「我的」统计 */
export async function allProgress() {
  return (await db()).getAll('progress');
}

export async function progressMap(courseId: string) {
  const all = await (await db()).getAllFromIndex('progress', 'byCourse', courseId);
  return new Map(all.map((p) => [p.skey, p]));
}

export async function setMark(courseId: string, sentenceId: string, mark: Mark) {
  const k = skey(courseId, sentenceId);
  const d = await db();
  const p = (await d.get('progress', k)) ?? { skey: k, courseId, practiced: 0, mark: 'none' as Mark, updatedAt: 0 };
  p.mark = mark;
  p.updatedAt = Date.now();
  await d.put('progress', p);
}

// ---------- 生词本 ----------

export async function listWords() {
  return (await (await db()).getAll('words')).sort((a, b) => b.addedAt - a.addedAt);
}
export async function hasWord(word: string) {
  return !!(await (await db()).get('words', word));
}
export async function addWord(e: Omit<WordEntry, 'addedAt'>) {
  await (await db()).put('words', { ...e, addedAt: Date.now() });
}
export async function removeWord(word: string) {
  await (await db()).delete('words', word);
}

// ---------- 练习天数（连续天数用） ----------
// 存在 localStorage：录音只保留最近 3 条，不能用来回溯哪天练过。

const DAYS_KEY = 'shadowing.days';
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

function readDays(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DAYS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function markPracticedToday() {
  const days = readDays();
  const k = dayKey(new Date());
  if (days[days.length - 1] === k) return;
  days.push(k);
  try {
    localStorage.setItem(DAYS_KEY, JSON.stringify(days.slice(-400)));
  } catch {
    /* 忽略 */
  }
}

/** 连续练习天数：今天没练则从昨天往前数 */
export function streakDays() {
  const set = new Set(readDays());
  const d = new Date();
  if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function totalPracticeDays() {
  return readDays().length;
}
