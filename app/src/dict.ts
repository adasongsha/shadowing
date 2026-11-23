// 离线查词：content/dict/<首字母>.json 按需加载（ECDICT 中文释义 + CMUdict 美音音标）。
// 分片里的值：[IPA, 中文释义, 考试标签] 或 "@原形"（词形变化）。
import { contentUrl } from './content';

export interface Entry {
  word: string;
  /** 用户点的词和原形不同时，记下原来的词形（如 went → go） */
  from?: string;
  ipa: string;
  zh: string;
  tags: string[];
}

type Shard = Record<string, [string, string, string] | string>;
const shards = new Map<string, Promise<Shard>>();

function shard(letter: string) {
  let p = shards.get(letter);
  if (!p) {
    p = fetch(contentUrl(`dict/${letter}.json`)).then((r) => (r.ok ? r.json() : {}));
    p.catch(() => shards.delete(letter));
    shards.set(letter, p);
  }
  return p;
}

async function raw(w: string): Promise<[string, [string, string, string]] | null> {
  if (!/^[a-z]/.test(w)) return null;
  let v = (await shard(w[0]))[w];
  if (typeof v === 'string' && v.startsWith('@')) {
    const base = v.slice(1);
    const bv = (await shard(base[0]))[base];
    return Array.isArray(bv) ? [base, bv] : null;
  }
  return Array.isArray(v) ? [w, v] : null;
}

const TAG_NAMES: Record<string, string> = {
  zk: '中考', gk: '高考', cet4: '四级', cet6: '六级', ky: '考研', toefl: '托福', ielts: '雅思', gre: 'GRE',
};

/** 查一个词；会依次尝试原样、去掉 's / ' 的形式 */
export async function lookup(word: string): Promise<Entry | null> {
  const w = word.toLowerCase().replace(/[’]/g, "'").replace(/^[^a-z]+|[^a-z']+$/g, '');
  const tries = [w, w.replace(/'s$/, ''), w.replace(/'$/, ''), w.replace(/n't$/, '')].filter(
    (x, i, a) => x && a.indexOf(x) === i,
  );
  for (const t of tries) {
    const hit = await raw(t);
    if (hit) {
      const [base, [ipa, zh, tags]] = hit;
      return {
        word: base,
        from: base !== w ? word : undefined,
        ipa,
        zh,
        tags: tags ? tags.split(' ').map((t) => TAG_NAMES[t] ?? t) : [],
      };
    }
  }
  return null;
}

/** 预热某个字母的分片（例如打开查词页时） */
export function preload(letters: string) {
  for (const l of letters) shard(l);
}

// ---------- 系统语音朗读（美音，离线可用） ----------

let voice: SpeechSynthesisVoice | null | undefined;
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-').startsWith('en-US'));
  // 优先系统的高质量声音
  return vs.find((v) => /samantha|ava|allison|susan|zoe/i.test(v.name)) ?? vs.find((v) => v.localService) ?? vs[0] ?? null;
}

export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speak(text: string) {
  if (!canSpeak) return;
  if (voice === undefined || !voice) voice = pickVoice();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  if (voice) u.voice = voice;
  u.rate = 0.9;
  speechSynthesis.speak(u);
}
