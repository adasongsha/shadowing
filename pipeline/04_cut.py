"""04 切分：按 selected.json 的时间戳从 hq.wav 切出单句 → 响度归一 → AAC m4a。

- 前留 pad_before、后留 pad_after，但不越过相邻语音段（安全边界 min_start / max_end），避免切进中文讲解
- 首尾 30ms 淡入淡出；两遍 loudnorm（先测量再线性归一），短句音量也稳定
- 输出 work/dayXX/audio/dayXX_s001.m4a 和 work/dayXX/cut.json

用法：
  python 04_cut.py --day 1
  python 04_cut.py --day 1 --from-review   # 用校对结果（review.json）只重切改动过的句子（M3）
"""
import json
import re

from common import day_arg_parser, day_dir, ffprobe_duration, load_config, parse_days, read_json, run, write_json


def measure_loudness(src, start, dur, cfg):
    log = run(["ffmpeg", "-v", "info", "-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", src,
               "-af", f"loudnorm=I={cfg['cut']['loudnorm_i']}:TP=-1.5:LRA=11:print_format=json",
               "-f", "null", "-"], capture=True)
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", log, re.S)
    return json.loads(m.group(0)) if m else None


def cut_one(src, dst, start, end, cfg):
    c = cfg["cut"]
    dur = end - start
    fade = min(c["fade"], dur / 4)
    m = measure_loudness(src, start, dur, cfg)
    ln = f"loudnorm=I={c['loudnorm_i']}:TP=-1.5:LRA=11"
    if m and m["input_i"] not in ("-inf", "inf"):
        ln += (f":measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
               f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    af = (f"afade=t=in:st=0:d={fade:.3f},afade=t=out:st={dur - fade:.3f}:d={fade:.3f},"
          f"{ln},aresample={cfg['extract']['hq_rate']}")
    run(["ffmpeg", "-y", "-v", "error", "-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", src,
         "-af", af, "-ac", "1", "-c:a", "aac", "-b:a", c["bitrate"], "-movflags", "+faststart", dst])


def bounds(s, cfg):
    """加 padding，但不越过安全边界"""
    c = cfg["cut"]
    start = s["start"] - c["pad_before"]
    end = s["end"] + c["pad_after"]
    if s.get("min_start") is not None:
        start = max(start, s["min_start"] + c["guard"])
    if s.get("max_end") is not None:
        end = min(end, s["max_end"] - c["guard"])
    return max(0.0, min(start, s["start"])), max(end, s["end"])


def cut_day(cfg, day, from_review=False):
    work = day_dir(cfg["paths"]["work"], day)
    src = work / "hq.wav"
    sel = read_json(work / "selected.json")
    prev = {}
    if from_review:
        rv = read_json(work / "review.json")
        prev = {x["id"]: x for x in read_json(work / "cut.json")} if (work / "cut.json").exists() else {}
        sel = rv["sentences"]
    out_dir = work / "audio"
    out_dir.mkdir(exist_ok=True)
    total = src_dur = ffprobe_duration(src)
    result = []
    n_cut = 0
    for s in sel:
        if s.get("deleted"):
            continue
        start, end = bounds(s, cfg)
        end = min(end, total)
        dst = out_dir / f"{s['id']}.m4a"
        p = prev.get(s["id"])
        unchanged = p and abs(p["cut_start"] - start) < 1e-3 and abs(p["cut_end"] - end) < 1e-3 and dst.exists()
        if not unchanged:
            cut_one(src, dst, start, end, cfg)
            n_cut += 1
        result.append({"id": s["id"], "text": s["text"], "zh": s.get("zh", ""), "start": s["start"], "end": s["end"],
                       "cut_start": round(start, 3), "cut_end": round(end, 3),
                       "duration": round(ffprobe_duration(dst), 2)})
    # 清理已删除句子的旧文件
    keep = {r["id"] for r in result}
    for f in out_dir.glob("*.m4a"):
        if f.stem not in keep:
            f.unlink()
    write_json(work / "cut.json", result)
    print(f"day{day:02d}: 切出 {n_cut} 句（共 {len(result)} 句，源 {src_dur:.0f}s）→ {out_dir}")


if __name__ == "__main__":
    ap = day_arg_parser(__doc__)
    ap.add_argument("--from-review", action="store_true", help="使用 review.json 的校对结果")
    args = ap.parse_args()
    cfg = load_config()
    for d in parse_days(args.days, cfg["paths"]["raw"]):
        cut_day(cfg, d, args.from_review)
