"""06 打包：work/dayXX/cut.json + audio/*.m4a → packs/<course_id>[_dayA-B].zip

用法：
  python 06_pack.py --day 1          # → oral-sentences_day01.zip
  python 06_pack.py --day 1-5        # → oral-sentences_day01-05.zip（按天分包，避免单个 zip 太大）
  python 06_pack.py --day all        # → oral-sentences.zip
"""
import json
import zipfile
from datetime import date

from common import day_arg_parser, day_dir, load_config, parse_days, read_json


def pack(cfg, days, label):
    course = cfg["course"]
    out_days = []
    files = []
    for d in days:
        work = day_dir(cfg["paths"]["work"], d)
        if not (work / "cut.json").exists():
            print(f"day{d:02d}: 还没有切分结果，跳过")
            continue
        sents = []
        for s in read_json(work / "cut.json"):
            rel = f"audio/{s['id']}.m4a"
            item = {"id": s["id"], "text": s["text"], "audio": rel, "duration": s["duration"]}
            if s.get("zh"):
                item["zh"] = s["zh"]
            sents.append(item)
            files.append((work / "audio" / f"{s['id']}.m4a", rel))
        out_days.append({"day": d, "title": f"Day {d}", "sentences": sents})
    if not out_days:
        raise SystemExit("没有可打包的 Day")
    manifest = {"schema": 1, "course_id": course["id"], "title": course["title"],
                "created_at": date.today().isoformat(), "days": out_days}
    packs = cfg["paths"]["packs"]
    packs.mkdir(parents=True, exist_ok=True)
    dst = packs / f"{course['id']}{label}.zip"
    with zipfile.ZipFile(dst, "w") as z:
        z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        for src, rel in files:
            z.write(src, rel, compress_type=zipfile.ZIP_STORED)  # m4a 已压缩
    n = sum(len(d["sentences"]) for d in out_days)
    print(f"→ {dst}（{len(out_days)} 天 / {n} 句，{dst.stat().st_size / 1e6:.1f} MB）")


if __name__ == "__main__":
    args = day_arg_parser(__doc__).parse_args()
    cfg = load_config()
    days = parse_days(args.days, cfg["paths"]["raw"])
    if args.days == "all":
        label = ""
    elif len(days) == 1:
        label = f"_day{days[0]:02d}"
    else:
        label = f"_day{days[0]:02d}-{days[-1]:02d}"
    pack(cfg, days, label)
