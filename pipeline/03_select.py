"""03 选句：挑出当天需要跟读的英文句子 → work/dayXX/selected.json

两种模式（自动选择）：

A. 教材模式（有 work/dayXX/script.json 时，由 00_script.py 生成）
   每天的课结构是：开篇介绍 → 朗读①（读一遍所有句子）→ 逐句讲解 → 朗读②（再读一遍）。
   1. 在 Whisper 的逐词结果里，为每句教材原文找出所有出现位置（模糊匹配，容忍识别错词）
   2. 最早一次出现属于朗读①，最晚一次属于朗读②；讲解里零散提到的不选
   3. 每句保留一遍（默认取匹配度更高的，持平时按 prefer_pass），其余记到 alternates，校对时可以换
   4. 用教材原文做强制对齐，精修起止时间；不越过前后相邻的词（避免切进中文讲解）

B. 规则模式（没有教材时，SPEC 2.3）
   英文段、≥3 个词、时长 0.8～15s；按文本相似度去重，保留时长居中的那遍。

用法：python 03_select.py --day 1
"""
import re
import statistics
import wave
from difflib import SequenceMatcher
from pathlib import Path

import numpy as np

from common import day_arg_parser, day_dir, load_config, parse_days, read_json, write_json

CJK = re.compile(r"[㐀-鿿]")
SR = 16000


def norm_tokens(text):
    text = text.lower().replace("’", "'")
    return re.findall(r"[a-z]+(?:'[a-z]+)?", text)


# ---------------- 词流 ----------------

def word_stream(transcript):
    """[{tok, start, end, en}]：英文词一个 token；中文词作为「隔断」（tok=None）"""
    out = []
    for seg in transcript:
        for w in seg["words"]:
            raw = w["w"]
            if CJK.search(raw):
                out.append({"tok": None, "start": w["start"], "end": w["end"], "en": False})
                continue
            toks = norm_tokens(raw)
            for t in toks:  # 罕见情况：一个「词」里有多个 token
                out.append({"tok": t, "start": w["start"], "end": w["end"], "en": True})
    return out


def similarity(target, seq):
    """字母级相似度：容忍识别错词（zipper lips ≈ zip your lips），又不会让单个词（me）匹配上整句"""
    return SequenceMatcher(None, " ".join(target), " ".join(seq), autojunk=False).ratio()


def find_occurrences(target, W, min_score):
    """在词流 W 里找 target（token 列表）所有出现位置，返回 [(score, i, j)]，W[i:j] 为匹配区间"""
    n = len(target)
    cands = []
    for i in range(len(W)):
        if not W[i]["en"]:
            continue
        for L in range(max(1, n - 2), n + 3):
            j = i + L
            if j > len(W) or not all(w["en"] for w in W[i:j]):
                break
            sc = similarity(target, [w["tok"] for w in W[i:j]])
            if sc >= min_score:
                cands.append((sc, i, j))
    # 非极大值抑制：重叠的候选只留分数最高的
    cands.sort(key=lambda c: (-c[0], c[2] - c[1]))
    picked = []
    for c in cands:
        if all(c[2] <= p[1] or c[1] >= p[2] for p in picked):
            picked.append(c)
    return sorted(picked, key=lambda c: c[1])


def find_read_passes(occ, W, max_gap):
    """找「朗读段」：当天所有句子按教材顺序、间隔不超过 max_gap 秒依次出现的一串。
    返回 [chain]，chain[k] 为第 k 句在这一遍里的出现（可能为 None），按时间排序。"""
    n = len(occ)
    chains = []
    for k0 in range(n):  # 允许开头几句没识别到
        for o0 in occ[k0]:
            chain = [None] * n
            chain[k0] = o0
            t = W[o0[2] - 1]["end"]
            for k in range(k0 + 1, n):
                nxt = [o for o in occ[k] if W[o[1]]["start"] >= t - 0.1 and W[o[1]]["start"] - t <= max_gap]
                if nxt:
                    chain[k] = min(nxt, key=lambda o: o[1])
                    t = W[chain[k][2] - 1]["end"]
            found = sum(c is not None for c in chain)
            if found >= max(2, round(n * 0.6)):
                chains.append(chain)
        if chains:
            break
    if not chains:
        return []
    start = lambda ch: min(W[c[1]]["start"] for c in ch if c)
    first = min(chains, key=start)
    last = max(chains, key=start)
    return [first] if first is last else [first, last]


# ---------------- 强制对齐精修 ----------------

_aligner = None


def load_audio(p: Path):
    with wave.open(str(p)) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768


def refine(text, lo, hi, audio, cfg):
    """在 [lo, hi] 窗口内用原文做强制对齐，返回 (start, end) 或 None"""
    global _aligner
    import importlib

    whisperx = importlib.import_module("whisperx")
    if _aligner is None:
        _aligner = importlib.import_module("02_transcribe").load_aligner(cfg)
    model, meta = _aligner
    try:
        out = whisperx.align([{"start": lo, "end": hi, "text": text}], model, meta, audio, "cpu",
                             return_char_alignments=False)
    except Exception:
        return None
    ws = [w for s in out["segments"] for w in s.get("words", []) if "start" in w]
    if not ws:
        return None
    return ws[0]["start"], ws[-1]["end"]


# ---------------- 边界修正：按实际音量 ----------------
# 强制对齐给的句尾常常偏早（尾音的拖音没算进去），VAD 又太粗。这里直接看 20ms 帧的音量：
#   句尾之后音量还高 → 这句还没说完，句尾后延；降下来之后到下一次变响之前，都是可以留白的静音。

FRAME = 0.02


def frame_db(audio):
    n = int(FRAME * SR)
    fr = audio[: len(audio) // n * n].reshape(-1, n)
    return 20 * np.log10(np.sqrt((fr ** 2).mean(1)) + 1e-9)


def snap_bounds(start, end, db, loud_thr, bridge=0.15, max_extend=0.5, tight=0.1):
    """返回 (start, end, min_start, max_end)。
    loud_thr：比底噪高约 25dB，算「在说话」；呼吸声、底噪不算。
    bridge：短于这个长度的安静（如爆破音前的闭气）不算句子结束。"""
    n = len(db)
    loud = db > loud_thr
    gap = int(bridge / FRAME)

    def walk(k, step):
        """从帧 k 开始沿 step 方向走，返回 (语音边界帧, 下一段语音起点帧, 是否连续)"""
        last = k - step  # 最后一个「在说话」的帧
        lim = int(max_extend / FRAME)
        i = k
        while 0 <= i < n:
            if loud[i]:
                if abs(i - k) > lim:          # 一直有人在说：两句之间没有停顿
                    return last, i, True
                last = i
            elif abs(i - last) > gap:         # 安静超过 bridge：这句结束了
                break
            i += step
        j = i
        while 0 <= j < n and not (loud[j] and 0 <= j + step < n and loud[j + step]):
            j += step
        return last, j, False

    k_end, k_next, cont = walk(int(end / FRAME), 1)
    if cont:
        max_end = end + tight
    else:
        end = max(end, (k_end + 1) * FRAME)
        max_end = k_next * FRAME
    k_start, k_prev, cont = walk(int(start / FRAME) - 1, -1)
    if cont:
        min_start = start - tight
    else:
        start = min(start, k_start * FRAME)
        min_start = (k_prev + 1) * FRAME
    return start, end, max(0.0, min_start), max_end


# ---------------- A. 教材模式 ----------------

def select_with_script(cfg, day, work):
    sc = cfg["select"]
    script = read_json(work / "script.json")
    W = word_stream(read_json(work / "transcript.json"))
    audio = load_audio(work / "asr.wav") if cfg["align"]["enabled"] else None
    total = len(audio) / SR if audio is not None else 1e9
    prefer = sc.get("prefer_pass", "first")

    all_occ = [find_occurrences(norm_tokens(it["text"]), W, sc.get("min_match", 0.6)) for it in script]
    passes = find_read_passes(all_occ, W, sc.get("max_read_gap", 8.0))
    for p in passes:
        found = [c for c in p if c]
        print(f"   朗读段：{W[found[0][1]]['start']:.1f}s ~ {W[found[-1][2] - 1]['end']:.1f}s，找到 {len(found)}/{len(script)} 句")
    if not passes:
        print("   ⚠️ 没找到朗读段，改为在全文中匹配")

    db = frame_db(audio) if audio is not None else None
    thr = float(np.percentile(db, 5)) + sc.get("speech_margin_db", 25) if db is not None else 0

    selected, missing = [], []
    for k, item in enumerate(script, 1):
        occ = all_occ[k - 1]
        if not occ:
            missing.append(item["text"])
            continue
        in_pass = [p[k - 1] for p in passes if p[k - 1] is not None]
        if in_pass:
            first, last = in_pass[0], in_pass[-1]
        else:  # 朗读段里没找到，退回到全文出现位置
            first, last = occ[0], occ[-1]
        if first is last:
            chosen = first
        elif abs(first[0] - last[0]) < 0.05:
            chosen = first if prefer == "first" else last
        else:
            chosen = max(first, last, key=lambda c: c[0])

        def span(c):
            _, i, j = c
            start, end = W[i]["start"], W[j - 1]["end"]
            min_start = W[i - 1]["end"] if i > 0 else 0.0
            max_end = W[j]["start"] if j < len(W) else total
            return start, end, min_start, max_end

        start, end, min_start, max_end = span(chosen)
        aligned = False
        if audio is not None:
            lo = max(min_start, start - 0.4)
            hi = min(max_end, end + 0.4)
            r = refine(item["text"], lo, hi, audio, cfg)
            # 对齐结果与 Whisper 差太多时不采用（多半是对齐失败）
            if r and abs(r[0] - start) < 0.8 and abs(r[1] - end) < 0.8 and r[1] > r[0]:
                start, end, aligned = r[0], r[1], True
        if db is not None:
            start, end, min_start, max_end = snap_bounds(start, end, db, thr)
        alternates = []
        for c in occ:
            if c is chosen:
                continue
            s2, e2, mn2, mx2 = span(c)
            alternates.append({"start": round(s2, 3), "end": round(e2, 3), "min_start": round(mn2, 3),
                               "max_end": round(mx2, 3), "score": round(c[0], 3),
                               "heard": " ".join(w["tok"] for w in W[c[1]:c[2]])})
        selected.append({
            "id": f"day{day:02d}_s{k:03d}",
            "text": item["text"],
            "zh": item.get("zh", ""),
            "start": round(start, 3),
            "end": round(end, 3),
            "min_start": round(min_start, 3),
            "max_end": round(max_end, 3),
            "score": round(chosen[0], 3),
            "heard": " ".join(w["tok"] for w in W[chosen[1]:chosen[2]]),
            "pass": ("first" if chosen is first else "last") if in_pass else "other",
            "occurrences": len(occ),
            "aligned": aligned,
            "alternates": alternates,
        })
    return selected, missing


# ---------------- B. 规则模式 ----------------

def select_by_rules(cfg, day, work):
    sc = cfg["select"]
    segs = read_json(work / "segments.json")
    cands = []
    for idx, s in enumerate(segs):
        if s["lang"] != "en":
            continue
        # 一段里有多句时，按句末标点拆开
        parts, cur = [], []
        for w in s["words"]:
            cur.append(w)
            if re.search(r"[.!?]$", w["w"].strip()):
                parts.append(cur)
                cur = []
        if cur:
            parts.append(cur)
        for p in parts:
            text = re.sub(r"\s+", " ", " ".join(w["w"].strip() for w in p)).strip()
            dur = p[-1]["end"] - p[0]["start"]
            if len(norm_tokens(text)) < sc["min_words"] or not (sc["min_dur"] <= dur <= sc["max_dur"]):
                continue
            cands.append({"text": text, "start": p[0]["start"], "end": p[-1]["end"],
                          "min_start": segs[idx - 1]["end"] if idx else 0.0,
                          "max_end": segs[idx + 1]["start"] if idx + 1 < len(segs) else p[-1]["end"] + 1})
    # 去重：相似的归为一组，保留时长居中的
    groups = []
    for c in cands:
        key = " ".join(norm_tokens(c["text"]))
        for g in groups:
            if SequenceMatcher(None, key, g["key"]).ratio() >= sc["similarity"]:
                g["items"].append(c)
                break
        else:
            groups.append({"key": key, "items": [c]})
    selected = []
    for k, g in enumerate(groups, 1):
        items = g["items"]
        med = statistics.median(i["end"] - i["start"] for i in items)
        best = min(items, key=lambda i: abs((i["end"] - i["start"]) - med))
        selected.append({"id": f"day{day:02d}_s{k:03d}", **{x: best[x] for x in ("text", "start", "end", "min_start", "max_end")},
                         "zh": "", "alternates": [i for i in items if i is not best]})
    return selected, []


def select_day(cfg, day):
    work = day_dir(cfg["paths"]["work"], day)
    if (work / "script.json").exists():
        mode = "教材"
        selected, missing = select_with_script(cfg, day, work)
    else:
        mode = "规则"
        selected, missing = select_by_rules(cfg, day, work)
    write_json(work / "selected.json", selected)
    print(f"day{day:02d}: [{mode}模式] 选出 {len(selected)} 句 → {work / 'selected.json'}")
    for s in selected:
        flag = "" if s.get("score", 1) >= 0.85 else "  ⚠️ 匹配度低，请校对"
        extra = f"  {dict(first='朗读①', last='朗读②').get(s.get('pass'), '⚠️非朗读段')} · 出现{s.get('occurrences', 1)}次 · 匹配{s.get('score', 1):.2f}" if "score" in s else ""
        print(f"   {s['id']}  {s['start']:7.2f}-{s['end']:7.2f}  {s['text']}{extra}{flag}")
    for m in missing:
        print(f"   ✗ 音频里没找到：{m}")


if __name__ == "__main__":
    args = day_arg_parser(__doc__).parse_args()
    cfg = load_config()
    for d in parse_days(args.days, cfg["paths"]["raw"]):
        select_day(cfg, d)
