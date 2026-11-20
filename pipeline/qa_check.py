"""质检：把切好的每句音频单独再识别一遍，和教材原文比对，找出可能切坏的句子。

- 识别出中文 → 可能切进了讲解
- 与原文相似度低 → 可能吞字 / 多切 / 选错位置
输出 work/dayXX/qa.json，并打印需要人工听的句子。

用法：python qa_check.py --day 1-18
"""
import importlib
import subprocess

import numpy as np

from common import day_arg_parser, day_dir, load_config, parse_days, read_json, write_json

sel = importlib.import_module("03_select")


def decode(p):
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768


def check_day(cfg, day, model):
    import mlx_whisper

    work = day_dir(cfg["paths"]["work"], day)
    out = []
    for s in read_json(work / "cut.json"):
        audio = decode(work / "audio" / f"{s['id']}.m4a")
        target = sel.norm_tokens(s["text"])
        r = mlx_whisper.transcribe(audio, path_or_hf_repo=model, language=None, verbose=None,
                                   condition_on_previous_text=False)
        heard = r["text"].strip()
        score = sel.similarity(target, sel.norm_tokens(heard))
        zh = bool(sel.CJK.search(heard))
        if score < 0.8 and not zh:
            # 短句自动识别容易跑偏：限定英文再听一次，取较好的结果
            r2 = mlx_whisper.transcribe(audio, path_or_hf_repo=model, language="en", verbose=None,
                                        condition_on_previous_text=False)
            s2 = sel.similarity(target, sel.norm_tokens(r2["text"]))
            if s2 > score:
                heard, score, r = r2["text"].strip(), s2, r2
        out.append({"id": s["id"], "text": s["text"], "heard": heard, "lang": r["language"],
                    "score": round(score, 3), "has_zh": zh})
    write_json(work / "qa.json", out)
    return out


if __name__ == "__main__":
    args = day_arg_parser(__doc__).parse_args()
    cfg = load_config()
    from pathlib import Path

    model = str((Path(__file__).parent / cfg["asr"]["model"]).resolve())
    total = flagged = 0
    for d in parse_days(args.days, cfg["paths"]["raw"]):
        for q in check_day(cfg, d, model):
            total += 1
            bad = q["has_zh"] or q["score"] < 0.8
            flagged += bad
            mark = "⚠️" if bad else "✓ "
            if bad or q["score"] < 0.95:
                print(f"{mark} {q['id']}  相似度 {q['score']:.2f}  原文：{q['text']}\n      识别：{q['heard']}")
    print(f"\n共 {total} 句，需要人工听的 {flagged} 句（其余均为纯英文且与原文一致）")
