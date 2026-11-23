"""样例句子课：sentences.yaml → Kokoro 合成 + 连读弱读标注 → app/public/content/sentences/sample.zip

课程包格式与流水线 06_pack.py 一致（schema 1），每句多一个可选的 hints 字段。
已经合成过的句子会复用（文本没变就不重新合成），加 --force 全部重做。

用法：python build_sentences.py [--force]
"""
import argparse
import json
import zipfile
from datetime import date

import yaml

from common import ROOT, load_config
from hints import annotate
from tts import synth


def main(force=False):
    cfg = load_config()["sentences"]
    src = yaml.safe_load((ROOT / cfg["src"]).read_text(encoding="utf-8"))
    work = ROOT / cfg["work_dir"]
    cache_path = work / "cache.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() and not force else {}

    days, files = [], []
    for gi, g in enumerate(src["groups"], 1):
        sents = []
        for si, row in enumerate(g["sentences"], 1):
            text, zh = row[0], row[1]
            sid = f"g{gi:02d}_s{si:03d}"
            wav = work / "audio" / f"{sid}.m4a"
            if cache.get(sid, {}).get("text") != text or not wav.exists():
                dur = synth(text, wav)
                cache[sid] = {"text": text, "duration": dur}
                print(f"  合成 {sid}：{text}（{dur}s）")
            item = {"id": sid, "text": text, "zh": zh, "audio": f"audio/{sid}.m4a",
                    "duration": cache[sid]["duration"], "hints": annotate(text)}
            sents.append(item)
            files.append((wav, item["audio"]))
        days.append({"day": gi, "title": g["title"], "sentences": sents})
    work.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=1))

    manifest = {"schema": 1, "course_id": src["course_id"], "title": src["title"], "builtin": True,
                "created_at": date.today().isoformat(), "days": days}
    out = ROOT / cfg["out"]
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w") as z:
        z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=1))
        for f, rel in files:
            z.write(f, rel, compress_type=zipfile.ZIP_STORED)
    n = sum(len(d["sentences"]) for d in days)
    print(f"→ {out}（{len(days)} 组 / {n} 句，{out.stat().st_size / 1e6:.2f} MB）")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true")
    main(ap.parse_args().force)
