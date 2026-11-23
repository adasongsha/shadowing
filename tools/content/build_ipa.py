"""音标数据：phonemes.yaml + 舌位剖面图（维基共享资源 CC0）+ 例词合成
→ app/public/content/ipa/index.json、img/*.svg、audio/*.m4a

剖面图需要先下载到 data/commons/svg/（文件名是音标符号，如 θ.svg，另有 meta.json 记录来源）。
例词音频已存在就复用，--force 全部重做。

用法：python build_ipa.py [--force]
"""
import argparse
import json
import re
import shutil

import yaml

from build_dict import load_cmudict
from common import ROOT, load_config, write_json
from tts import synth

# 剖面图文件名里的音标 → ASCII 文件名（避免 URL 里出现特殊字符）
IMG_NAME = {"ə": "schwa", "ɪ": "ih", "ɛ": "eh", "æ": "ae", "ʊ": "uu", "θ": "th", "ð": "dh", "ʃ": "sh", "ʒ": "zh", "ŋ": "ng"}


def img_file(sym):
    return IMG_NAME.get(sym, sym) + ".svg"


def main(force=False):
    cfg = load_config()["ipa"]
    src = yaml.safe_load((ROOT / cfg["src"]).read_text(encoding="utf-8"))["phonemes"]
    out = ROOT / cfg["out_dir"]
    commons = ROOT / cfg["commons_dir"] / "svg"
    meta = json.loads((commons / "meta.json").read_text()) if (commons / "meta.json").exists() else {}
    cmu = load_cmudict(ROOT / load_config()["dict"]["src_dir"] / "cmudict.dict")

    (out / "img").mkdir(parents=True, exist_ok=True)
    used_imgs = {}
    phonemes = []
    for p in src:
        imgs = []
        for sym in p.get("img") or []:
            f = commons / f"{sym}.svg"
            if not f.exists():
                print(f"  缺少剖面图 {sym}（{p['id']}），先跳过")
                continue
            name = img_file(sym)
            shutil.copy(f, out / "img" / name)
            imgs.append(f"img/{name}")
            used_imgs[name] = meta.get(sym, {})
        words = []
        for w, hl in p["words"]:
            rel = f"audio/{w.lower()}.m4a"
            dst = out / rel
            if force or not dst.exists():
                dur = synth(w.capitalize() + ".", dst)
                print(f"  合成 {w}（{dur}s）")
            words.append({"w": w, "hl": hl, "ipa": cmu.get(w.lower(), ""), "audio": rel})
        phonemes.append({
            "id": p["id"], "ipa": p["ipa"], "group": p["group"], "img": imgs, "approx": bool(p.get("approx")),
            "tip": p["tip"].strip(), "words": words, "pairs": p.get("pairs") or [],
        })

    credits = [{"file": k, "title": v.get("title"), "license": v.get("license"),
                "artist": re.sub(r"<[^>]+>", "", v.get("artist", "")).strip(), "page": v.get("page")}
               for k, v in sorted(used_imgs.items())]
    write_json(out / "index.json", {"phonemes": phonemes, "credits": credits})
    n_img = sum(bool(p["img"]) for p in phonemes)
    print(f"→ {out / 'index.json'}（{len(phonemes)} 个音标，{n_img} 个有剖面图）")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true")
    main(ap.parse_args().force)
