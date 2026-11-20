// 课程包导入：解压 zip → 校验 manifest → 写入 IndexedDB。
// 同一课程重复导入时按 sentence id 合并：同 id 覆盖，新 id 追加，已有的其它天保留。
import JSZip from 'jszip';
import { db, skey, type Course, type Day } from './db';

const MIME: Record<string, string> = {
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

export interface ImportResult {
  courseId: string;
  title: string;
  days: number;
  sentences: number;
  merged: boolean;
}

export async function importPack(file: File, onProgress?: (msg: string) => void): Promise<ImportResult> {
  onProgress?.('解压中…');
  const zip = await JSZip.loadAsync(file);
  const mf = zip.file('manifest.json');
  if (!mf) throw new Error('课程包里没有 manifest.json');
  let manifest: any;
  try {
    manifest = JSON.parse(await mf.async('string'));
  } catch {
    throw new Error('manifest.json 不是合法的 JSON');
  }
  if (manifest.schema !== 1) throw new Error(`不支持的课程包版本：schema=${manifest.schema}`);
  if (!manifest.course_id || !Array.isArray(manifest.days)) throw new Error('manifest 缺少 course_id 或 days');

  const courseId: string = manifest.course_id;
  const incomingDays: Day[] = manifest.days.map((d: any) => ({
    day: Number(d.day),
    title: d.title || `Day ${d.day}`,
    sentences: (d.sentences || []).map((s: any) => ({
      id: String(s.id),
      text: String(s.text ?? ''),
      zh: s.zh ? String(s.zh) : undefined,
      audio: String(s.audio),
      duration: typeof s.duration === 'number' ? s.duration : undefined,
    })),
  }));

  // 先把所有音频读出来（避免在 IndexedDB 事务中 await 非 IDB 操作导致事务自动提交）
  const total = incomingDays.reduce((n, d) => n + d.sentences.length, 0);
  const audios: { key: string; data: ArrayBuffer; type: string }[] = [];
  let i = 0;
  for (const d of incomingDays) {
    for (const s of d.sentences) {
      const f = zip.file(s.audio);
      if (!f) throw new Error(`缺少音频文件：${s.audio}`);
      const ext = s.audio.split('.').pop()!.toLowerCase();
      audios.push({ key: skey(courseId, s.id), data: await f.async('arraybuffer'), type: MIME[ext] ?? 'audio/mp4' });
      i++;
      if (i % 10 === 0 || i === total) onProgress?.(`读取音频 ${i}/${total}`);
    }
  }

  onProgress?.('写入本地存储…');
  const d = await db();
  const existing = await d.get('courses', courseId);
  const course: Course = {
    course_id: courseId,
    title: manifest.title || existing?.title || courseId,
    created_at: manifest.created_at,
    imported_at: Date.now(),
    days: mergeDays(existing?.days ?? [], incomingDays),
  };

  const tx = d.transaction(['courses', 'audio'], 'readwrite');
  for (const a of audios) await tx.objectStore('audio').put({ ...a, courseId });
  await tx.objectStore('courses').put(course);
  await tx.done;

  return { courseId, title: course.title, days: incomingDays.length, sentences: total, merged: !!existing };
}

function mergeDays(old: Day[], incoming: Day[]): Day[] {
  const byDay = new Map(old.map((d) => [d.day, { ...d, sentences: [...d.sentences] }]));
  for (const nd of incoming) {
    const od = byDay.get(nd.day);
    if (!od) {
      byDay.set(nd.day, nd);
      continue;
    }
    od.title = nd.title;
    const idx = new Map(od.sentences.map((s, i) => [s.id, i]));
    for (const s of nd.sentences) {
      const at = idx.get(s.id);
      if (at === undefined) od.sentences.push(s);
      else od.sentences[at] = s;
    }
  }
  return [...byDay.values()].sort((a, b) => a.day - b.day);
}
