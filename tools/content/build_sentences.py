"""样例句子课：sentences.yaml → Kokoro 合成 + 连读弱读标注 → app/public/content/sentences/sample.zip

课程包格式与流水线 06_pack.py 一致（schema 1），另外有几个可选字段：
  每组 intro {what, why, how}：这一组的讲解
  每句 note：这一句的讲解；hints：发音提示（含 stress 重读词）
已经合成过的句子会复用（文本没变就不重新合成），加 --force 全部重做。

用法：python build_sentences.py [--force]
"""
import argparse
import json
import re
import zipfile
from datetime import date

import yaml

from common import ROOT, load_config
from hints import annotate, tokens
from tts import synth


CJK = r"[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef「」『』]"


def clean(t: str) -> str:
    """把 YAML 折行带来的空白合并；两个中文字符之间的空格（折行造成的）去掉，中英文之间保留"""
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(rf"(?<={CJK}) (?={CJK})", "", t)
    return re.sub(r"(?<=[，。：；！？、「」（）]) | (?=[，。：；！？、「」（）])", "", t)  # 中文标点两侧不留空格


def stress_hints(text, words):
    """重读词 → stress 提示（整词）"""
    want = [w.lower() for w in words]
    out = []
    for w, s, e, _ in tokens(text):
        if w.lower() in want:
            out.append({"type": "stress", "from": s, "to": e, "note": "重读：这句话的信息重点"})
            want.remove(w.lower())
    if want:
        raise SystemExit(f"重读词在句子里找不到：{want} ← {text}")
    return out


def main(force=False):
    cfg = load_config()["sentences"]
    # BaseLoader：全部当字符串读，避免 off / no / yes 被 YAML 当成布尔值
    src = yaml.load((ROOT / cfg["src"]).read_text(encoding="utf-8"), Loader=yaml.BaseLoader)
    work = ROOT / cfg["work_dir"]
    cache_path = work / "cache.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() and not force else {}

    days, files = [], []
    for gi, g in enumerate(src["groups"], 1):
        sents = []
        for si, row in enumerate(g["sentences"], 1):
            if isinstance(row, list):  # 兼容旧写法 [英文, 中文]
                row = {"en": row[0], "zh": row[1]}
            text, zh = row["en"], row["zh"]
            sid = f"g{gi:02d}_s{si:03d}"
            wav = work / "audio" / f"{sid}.m4a"
            if cache.get(sid, {}).get("text") != text or not wav.exists():
                dur = synth(text, wav)
                cache[sid] = {"text": text, "duration": dur}
                print(f"  合成 {sid}：{text}（{dur}s）")
            item = {"id": sid, "text": text, "zh": zh, "audio": f"audio/{sid}.m4a",
                    "duration": cache[sid]["duration"],
                    "hints": sorted(annotate(text) + stress_hints(text, row.get("stress") or []),
                                    key=lambda h: (h["from"], h["to"]))}
            if row.get("note"):
                item["note"] = clean(row["note"])
            sents.append(item)
            files.append((wav, item["audio"]))
        day = {"day": gi, "title": g["title"], "sentences": sents}
        if g.get("intro"):
            day["intro"] = {k: clean(v) for k, v in g["intro"].items() if v}
        days.append(day)
    work.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=1))

    manifest = {"schema": 1, "course_id": src["course_id"], "title": src["title"], "builtin": True,
                "created_at": date.today().isoformat(), "days": days}
    # 内容版本：manifest 变了（句子、讲解、提示）版本就变，App 据此自动更新已安装的样例课
    import hashlib
    body = json.dumps(manifest | {"created_at": ""}, ensure_ascii=False, sort_keys=True)
    manifest["version"] = hashlib.sha256(body.encode()).hexdigest()[:12]
    out = ROOT / cfg["out"]
    out.parent.mkdir(parents=True, exist_ok=True)
    (out.with_suffix(".json")).write_text(json.dumps({"version": manifest["version"]}))
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
