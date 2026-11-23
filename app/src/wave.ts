// 波形：把音频解码成 N 根柱子的峰值，并算出去掉首尾静音后的有效时长。
// 用 OfflineAudioContext 解码：不占用音频输出，不影响 iOS 的播放 / 录音会话。

export interface Wave {
  bars: number[]; // 0..1
  /** 有效时长（秒，去掉首尾静音） */
  duration: number;
}

const cache = new WeakMap<Blob, Promise<Wave | null>>();

export function waveOf(blob: Blob, n = 54): Promise<Wave | null> {
  let p = cache.get(blob);
  if (!p) {
    p = compute(blob, n).catch(() => null);
    cache.set(blob, p);
  }
  return p;
}

async function compute(blob: Blob, n: number): Promise<Wave | null> {
  const Ctx = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  if (!Ctx) return null;
  const ctx: OfflineAudioContext = new Ctx(1, 1, 44100);
  const data = await blob.arrayBuffer();
  const buf: AudioBuffer = await new Promise((resolve, reject) => {
    // 同时兼容回调写法（旧版 Safari）和 Promise 写法
    const p: any = ctx.decodeAudioData(data, resolve, reject);
    if (p && typeof p.then === 'function') p.then(resolve, reject);
  });
  return analyse(buf, n);
}

function analyse(buf: AudioBuffer, n: number): Wave {
  const data = buf.getChannelData(0);
  const sr = buf.sampleRate;
  // 20ms 帧的 RMS，用来找首尾静音
  const frame = Math.max(1, Math.round(sr * 0.02));
  const frames = Math.floor(data.length / frame);
  const rms = new Float32Array(frames);
  let peak = 0;
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * frame; i < (f + 1) * frame; i++) sum += data[i] * data[i];
    rms[f] = Math.sqrt(sum / frame);
    peak = Math.max(peak, rms[f]);
  }
  const thr = peak * 0.08; // 低于峰值 -22dB 算静音
  let a = 0;
  let b = frames - 1;
  while (a < b && rms[a] < thr) a++;
  while (b > a && rms[b] < thr) b--;
  const span = Math.max(1, b - a + 1);
  const bars: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = a + Math.floor((i * span) / n);
    const e = Math.max(s + 1, a + Math.floor(((i + 1) * span) / n));
    let m = 0;
    for (let f = s; f < e && f < frames; f++) m = Math.max(m, rms[f]);
    bars.push(peak ? m / peak : 0);
  }
  return { bars, duration: (span * frame) / sr };
}

/** 时长反馈：比较我的和原音的有效时长 */
export function durationFeedback(orig: number, mine: number) {
  const r = mine / orig;
  if (r > 1.25) return '比原音慢，弱读的小词可以更轻快';
  if (r < 0.8) return '比原音快，重读的词要读饱满';
  return '长度和原音接近';
}
