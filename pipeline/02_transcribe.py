"""02 转写：work/dayXX/asr.wav → work/dayXX/segments.json

步骤：
  1. Whisper 整节转写，带逐词时间戳（ASR 后端可插拔：mlx / faster-whisper）
  2. 逐词判断语种（按字符：含汉字 → zh，拉丁字母 → en），把连续同语种的词合成「语种段」
     —— 老师「跟我读 How's it going」中间不停顿也能分开
  3. 英文段用 wav2vec2 强制对齐（WhisperX）精修词边界
  4. 输出 segments.json：[{id, start, end, text, lang, words:[{w, start, end}]}]

另外保存 transcript.json（Whisper 原始结果），方便排查。

用法：python 02_transcribe.py --day 1 [--skip-asr]   # --skip-asr：复用已有 transcript.json，只重做 2～4
"""
import re
import time
import wave
from pathlib import Path

import numpy as np

from common import day_arg_parser, day_dir, load_config, parse_days, read_json, write_json

SR = 16000
CJK = re.compile(r"[㐀-鿿豈-﫿]")
LATIN = re.compile(r"[A-Za-z]")
# 引导模型在中英混说时保留英文原文（而不是翻译成中文）
PROMPT = "好，我们来学习今天的句子。How's it going? 跟我读：How's it going? 这句话的意思是你好吗。"


def load_wav(p: Path) -> np.ndarray:
    with wave.open(str(p)) as w:
        assert w.getframerate() == SR and w.getnchannels() == 1, "需要 16k 单声道 wav，请先运行 01_extract.py"
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768


# ---------------- 1. ASR 后端 ----------------

def asr_mlx(audio, cfg, language="__cfg__", prompt=PROMPT):
    import mlx_whisper

    model = cfg["asr"]["model"]
    local = (Path(__file__).parent / model).resolve()
    res = mlx_whisper.transcribe(
        audio,
        path_or_hf_repo=str(local) if local.exists() else model,
        language=cfg["asr"].get("language") if language == "__cfg__" else language,
        word_timestamps=True,
        initial_prompt=prompt,
        condition_on_previous_text=False,  # 降低长音频里的重复 / 幻觉
        verbose=None,
    )
    return [
        {"start": s["start"], "end": s["end"], "text": s["text"],
         "words": [{"w": x["word"], "start": x["start"], "end": x["end"], "p": x.get("probability")} for x in s.get("words", [])]}
        for s in res["segments"]
    ]


def asr_faster_whisper(audio, cfg, language="__cfg__", prompt=PROMPT):
    from faster_whisper import WhisperModel

    model = WhisperModel(cfg["asr"].get("fw_model", "large-v3"), device="cpu", compute_type="int8")
    lang = cfg["asr"].get("language") if language == "__cfg__" else language
    segs, _ = model.transcribe(audio, language=lang, word_timestamps=True,
                               initial_prompt=prompt, condition_on_previous_text=False, vad_filter=True)
    return [
        {"start": s.start, "end": s.end, "text": s.text,
         "words": [{"w": w.word, "start": w.start, "end": w.end, "p": w.probability} for w in (s.words or [])]}
        for s in segs
    ]


BACKENDS = {"mlx": asr_mlx, "faster-whisper": asr_faster_whisper}


# ---------------- 1b. 补漏识别 ----------------
# 中英混说时，Whisper 常把整段英文朗读「跳过」（时间轴上有人声，转写却是空的）。
# 用 VAD 找出这些有声但没有转写的片段，单独再识别一遍。

def vad_regions(audio, cfg):
    import torch
    from silero_vad import get_speech_timestamps, load_silero_vad

    v = cfg["vad"]
    return [(t["start"], t["end"]) for t in get_speech_timestamps(
        torch.from_numpy(audio), load_silero_vad(), sampling_rate=SR, threshold=v["threshold"],
        min_silence_duration_ms=v["min_silence_ms"], speech_pad_ms=v["speech_pad_ms"], return_seconds=True)]


def uncovered(regions, spans, min_len=0.6, tol=0.15):
    """VAD 语音区间减去已有转写词覆盖的区间，返回没被覆盖的片段"""
    spans = sorted(spans)
    out = []
    for rs, re_ in regions:
        cur = rs
        for ws, we in spans:
            if we <= cur or ws >= re_:
                continue
            if ws - tol > cur:
                out.append((cur, ws))
            cur = max(cur, we)
        if cur < re_:
            out.append((cur, re_))
    return [(a, b) for a, b in out if b - a >= min_len]


def fill_gaps(transcript, audio, cfg, backend):
    spans = [(w["start"], w["end"]) for s in transcript for w in s["words"]]
    gaps = uncovered(vad_regions(audio, cfg), spans)
    # 相邻的空洞合并成一块再识别（上下文更完整）
    chunks = []
    for a, b in gaps:
        if chunks and a - chunks[-1][1] < 1.0 and b - chunks[-1][0] < 28:
            chunks[-1] = (chunks[-1][0], b)
        else:
            chunks.append((a, b))
    added = []
    total = len(audio) / SR
    for a, b in chunks:
        a, b = max(0.0, a - 0.2), min(total, b + 0.2)
        piece = audio[int(a * SR): int(b * SR)]
        segs = backend(piece, cfg, language=None, prompt=None)
        if not any(s["words"] for s in segs):
            segs = backend(piece, cfg, language="en", prompt=None)
        for s in segs:
            s["start"] += a
            s["end"] += a
            s["filled"] = True
            for w in s["words"]:
                w["start"] += a
                w["end"] += a
            if s["words"]:
                added.append(s)
    merged = sorted(transcript + added, key=lambda s: s["start"])
    return merged, chunks, added


# ---------------- 2. 语种分段 ----------------

def word_lang(w: str):
    if CJK.search(w):
        return "zh"
    if LATIN.search(w):
        return "en"
    return None  # 纯标点 / 数字：跟随前一个词


def split_by_lang(transcript, max_gap=0.8):
    """把所有词按语种切成连续段；同语种但停顿超过 max_gap 也切开"""
    words = [w for s in transcript for w in s["words"] if w["w"].strip()]
    segs = []
    cur = None
    for w in words:
        lang = word_lang(w["w"]) or (cur["lang"] if cur else "zh")
        if cur and lang == cur["lang"] and w["start"] - cur["end"] <= max_gap:
            cur["words"].append(w)
            cur["end"] = w["end"]
        else:
            cur = {"lang": lang, "start": w["start"], "end": w["end"], "words": [w]}
            segs.append(cur)
    for s in segs:
        s["text"] = join_words(s["words"], s["lang"])
    return segs


def join_words(words, lang):
    if lang == "zh":
        return "".join(w["w"].strip() for w in words)
    return re.sub(r"\s+", " ", "".join(w["w"] for w in words)).strip()


# ---------------- 3. 强制对齐 ----------------

def load_aligner(cfg):
    import whisperx

    name = cfg["align"].get("model")
    if name:
        local = (Path(__file__).parent / name).resolve()
        name = str(local) if local.exists() else name
    return whisperx.load_align_model(language_code=cfg["align"]["language"], device="cpu", model_name=name)


def align_english(segs, audio, cfg):
    import whisperx

    en = [s for s in segs if s["lang"] == "en"]
    if not en:
        return
    model, meta = load_aligner(cfg)
    # 给每段左右各留一点余量再对齐，但不越过相邻段
    for i, s in enumerate(segs):
        if s["lang"] != "en":
            continue
        lo = max(segs[i - 1]["end"] if i else 0.0, s["start"] - 0.3)
        hi = min(segs[i + 1]["start"] if i + 1 < len(segs) else len(audio) / SR, s["end"] + 0.3)
        try:
            out = whisperx.align([{"start": lo, "end": hi, "text": s["text"]}], model, meta, audio, "cpu",
                                 return_char_alignments=False)
        except Exception as e:  # 对齐失败就保留 Whisper 的时间戳
            print(f"    对齐失败（保留原时间戳）：{s['text'][:40]} — {e}")
            continue
        ws = [w for seg in out["segments"] for w in seg.get("words", []) if "start" in w]
        if ws:
            s["start_whisper"], s["end_whisper"] = s["start"], s["end"]
            s["start"], s["end"] = ws[0]["start"], ws[-1]["end"]
            s["words"] = [{"w": w["word"], "start": w["start"], "end": w["end"], "p": w.get("score")} for w in ws]
            s["aligned"] = True


# ---------------- 入口 ----------------

def transcribe_day(cfg, day, skip_asr=False):
    work = day_dir(cfg["paths"]["work"], day)
    audio = load_wav(work / "asr.wav")
    tpath = work / "transcript.json"
    if skip_asr and tpath.exists():
        transcript = read_json(tpath)
    else:
        t0 = time.time()
        backend = BACKENDS[cfg["asr"]["backend"]]
        transcript = backend(audio, cfg)
        print(f"day{day:02d}: 转写完成（{time.time() - t0:.0f}s，{len(transcript)} 段）")
        transcript, chunks, added = fill_gaps(transcript, audio, cfg, backend)
        print(f"day{day:02d}: 补漏识别 {len(chunks)} 处空白，补回 {len(added)} 段")
        write_json(tpath, transcript)
    segs = split_by_lang(transcript)
    if cfg["align"]["enabled"]:
        align_english(segs, audio, cfg)
    for i, s in enumerate(segs):
        s["id"] = i
        s["start"], s["end"] = round(s["start"], 3), round(s["end"], 3)
    write_json(work / "segments.json", segs)
    n_en = sum(s["lang"] == "en" for s in segs)
    print(f"day{day:02d}: {len(segs)} 个语种段，其中英文 {n_en} 段 → {work / 'segments.json'}")


if __name__ == "__main__":
    ap = day_arg_parser(__doc__)
    ap.add_argument("--skip-asr", action="store_true")
    args = ap.parse_args()
    cfg = load_config()
    for d in parse_days(args.days, cfg["paths"]["raw"]):
        transcribe_day(cfg, d, args.skip_asr)
