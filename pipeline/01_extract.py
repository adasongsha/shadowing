"""01 提取音频：raw/dayXX/* → work/dayXX/asr.wav（16k 单声道，给 ASR）+ hq.wav（44.1k 单声道，给切分）。

一个 Day 目录里有多个文件时，按文件名顺序拼接。
用法：python 01_extract.py --day 1
"""
from common import day_arg_parser, day_dir, load_config, run

MEDIA = {".m4a", ".mp3", ".mp4", ".aac", ".wav", ".mov", ".m4v", ".flac"}


def extract_day(cfg, day):
    src_dir = day_dir(cfg["paths"]["raw"], day)
    files = sorted(p for p in src_dir.iterdir() if p.suffix.lower() in MEDIA)
    if not files:
        print(f"day{day:02d}: 没有音视频文件，跳过")
        return
    out = day_dir(cfg["paths"]["work"], day)
    out.mkdir(parents=True, exist_ok=True)
    inputs = []
    for f in files:
        inputs += ["-i", f]
    concat = f"concat=n={len(files)}:v=0:a=1," if len(files) > 1 else ""
    for name, rate in (("asr.wav", cfg["extract"]["asr_rate"]), ("hq.wav", cfg["extract"]["hq_rate"])):
        run(["ffmpeg", "-y", "-v", "error", *inputs, "-vn",
             "-filter_complex", f"{concat}aformat=channel_layouts=mono,aresample={rate}",
             "-c:a", "pcm_s16le", out / name])
    print(f"day{day:02d}: {len(files)} 个文件 → {out}/asr.wav, hq.wav")


if __name__ == "__main__":
    args = day_arg_parser(__doc__).parse_args()
    cfg = load_config()
    from common import parse_days
    for d in parse_days(args.days, cfg["paths"]["raw"]):
        extract_day(cfg, d)
