// 播放与录音。iOS 专项处理都集中在这里，对应 SPEC 3.3。
//
// 播放：只用 HTMLAudioElement（静音开关打开时 Web Audio 可能无声，<audio> 不受影响）。
//   每次用户点击都新建一个 audio 元素（规避录音后音频被路由到听筒、音量变小的问题），
//   「对比」的连续播放复用同一个元素、靠 ended 事件串联 —— 该元素已由点击激活，iOS 允许它继续换源播放。
// 录音：MediaRecorder，按 audio/mp4 → audio/webm 探测格式；同一会话复用一个 MediaStream；
//   离开练习页 / 进入后台时停止所有 track 释放麦克风；单句最长 30s 自动停止。

import { settings } from './settings';

// ---------------- audioSession（iOS 17+ Safari 的特性，做特性检测） ----------------

type SessionType = 'auto' | 'playback' | 'play-and-record' | 'ambient' | 'transient' | 'transient-solo';

function setSession(type: SessionType) {
  const s = (navigator as any).audioSession;
  if (s && 'type' in s) {
    try {
      s.type = type;
    } catch {
      /* 忽略 */
    }
  }
}

// ---------------- 播放 ----------------

export interface PlayItem {
  blob: Blob;
  rate?: number;
}

type Listener = (playing: string | null) => void;

class Player {
  private el: HTMLAudioElement | null = null;
  private urls: string[] = [];
  private timer: number | undefined;
  private token = 0;
  private tag: string | null = null;
  private listeners = new Set<Listener>();

  onChange(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get playing() {
    return this.tag;
  }

  private emit() {
    for (const fn of this.listeners) fn(this.tag);
  }

  stop() {
    this.token++;
    clearTimeout(this.timer);
    if (this.el) {
      this.el.onended = null;
      this.el.onerror = null;
      this.el.pause();
      this.el.removeAttribute('src');
      this.el.load();
      this.el = null;
    }
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
    if (this.tag !== null) {
      this.tag = null;
      this.emit();
    }
  }

  /**
   * 依次播放一组音频，两段之间间隔 gapMs。必须在用户点击的同步调用栈里调用。
   * tag 用来让 UI 知道当前在播什么（例如 'orig' / 'mine' / 'compare'）。
   */
  play(items: PlayItem[], tag: string, gapMs = 400): Promise<void> {
    this.stop();
    if (!items.length) return Promise.resolve();
    // 麦克风未占用时才切到「播放」会话（不受静音开关影响）。
    // 麦克风占用期间保持 play-and-record 不变：在两种会话之间来回切换时，iOS 要重新配置音频通道，
    // 录完马上播放的那一次可能「进度在走但没声音」。
    if (!recorder.holdsMic) setSession('playback');

    const my = ++this.token;
    const el = new Audio();
    el.preload = 'auto';
    (el as any).playsInline = true;
    el.setAttribute('playsinline', '');
    this.el = el;
    this.tag = tag;
    this.emit();

    return new Promise<void>((resolve) => {
      const finish = () => {
        if (my === this.token) this.stop();
        resolve();
      };
      const playAt = (i: number) => {
        if (my !== this.token) return resolve();
        const it = items[i];
        const url = URL.createObjectURL(it.blob);
        this.urls.push(url);
        el.src = url;
        const rate = it.rate ?? 1;
        // preservesPitch 默认就是 true，这里显式设置并兼容 webkit 前缀，保证 0.75× 不变调
        (el as any).preservesPitch = true;
        (el as any).webkitPreservesPitch = true;
        el.defaultPlaybackRate = rate;
        el.playbackRate = rate;
        el.onended = () => {
          if (my !== this.token) return resolve();
          if (i + 1 < items.length) {
            this.timer = window.setTimeout(() => playAt(i + 1), gapMs);
          } else finish();
        };
        el.onerror = finish;
        el.play().catch(finish);
      };
      playAt(0);
    });
  }
}

export const player = new Player();

// ---------------- 录音 ----------------

export const MAX_RECORD_MS = 30_000;

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/webm']) {
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return '';
}

export interface RecordResult {
  blob: Blob;
  duration: number; // 秒
}

class Recorder {
  private stream: MediaStream | null = null;
  private mr: MediaRecorder | null = null;
  private startedAt = 0;
  private autoStop: number | undefined;

  get isRecording() {
    return this.mr?.state === 'recording';
  }

  /** 当前是否持有一个活动的麦克风 stream */
  get holdsMic() {
    return !!this.stream?.getAudioTracks().some((t) => t.readyState === 'live');
  }

  get supported() {
    return !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  }

  get elapsedMs() {
    return this.isRecording ? Date.now() - this.startedAt : 0;
  }

  /** 第一次点击录音时才申请麦克风；之后在本会话内复用同一个 stream */
  private async getStream() {
    if (this.holdsMic) return this.stream!;
    // 拿麦克风前设好会话类型，之后整个练习过程中保持不变
    setSession('play-and-record');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    return this.stream;
  }

  /** 开始录音，返回的 Promise 在录音结束（手动停止或 30s 自动停止）时 resolve */
  async start(onAutoStop?: () => void): Promise<RecordResult> {
    if (this.isRecording) throw new Error('已在录音');
    player.stop();
    const stream = await this.getStream();
    const mime = pickMime();
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 96000 } : undefined);
    this.mr = mr;
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<RecordResult>((resolve, reject) => {
      mr.onstop = () => {
        clearTimeout(this.autoStop);
        const duration = (Date.now() - this.startedAt) / 1000;
        this.mr = null;
        if (settings.get().releaseMicAfterRecord) this.release();
        const type = mr.mimeType || mime || 'audio/mp4';
        resolve({ blob: new Blob(chunks, { type }), duration });
      };
      mr.onerror = (e: any) => {
        this.mr = null;
        reject(e.error ?? new Error('录音出错'));
      };
    });
    this.startedAt = Date.now();
    mr.start();
    this.autoStop = window.setTimeout(() => {
      if (this.isRecording) {
        onAutoStop?.();
        this.stop();
      }
    }, MAX_RECORD_MS);
    return done;
  }

  stop() {
    if (this.mr && this.mr.state !== 'inactive') this.mr.stop();
  }

  /** 停止所有 track，释放麦克风（状态栏的录音指示会消失） */
  release() {
    if (this.isRecording) this.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    setSession('auto');
  }
}

export const recorder = new Recorder();

// App 进入后台 / 页面被隐藏时：停止播放和录音、释放麦克风
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    player.stop();
    recorder.release();
  }
});
window.addEventListener('pagehide', () => recorder.release());
