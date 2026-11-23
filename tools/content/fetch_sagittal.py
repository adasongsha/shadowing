"""下载舌位剖面图：Richard Wright & Dan McCloy 的 phonetics-teaching-assets（CC0 1.0）
→ data/commons/svg/<音标>.svg + meta.json（来源信息，build_ipa.py 用来生成来源页）

单线程、每个文件间隔 2 秒；已下载的跳过。
用法：python fetch_sagittal.py
"""
import json
import time
import urllib.parse
import urllib.request

from common import ROOT, load_config

REPO = "drammock/phonetics-teaching-assets"
RAW = f"https://raw.githubusercontent.com/{REPO}/main/midsaggital_articulations"
# 音标 → 仓库里的文件
FILES = {
    "i": "vowels/svg/i.svg", "ɪ": "vowels/svg/ɪ.svg", "ɛ": "vowels/svg/ɛ.svg", "æ": "vowels/svg/æ.svg",
    "a": "vowels/svg/a.svg", "u": "vowels/svg/u.svg", "ʊ": "vowels/svg/ʊ.svg",
    "ə": "consonants/svg/neutral.svg",  # 中性声道：近似 schwa
    "p": "consonants/svg/p.svg", "b": "consonants/svg/b.svg", "t": "consonants/svg/t.svg", "d": "consonants/svg/d.svg",
    "k": "consonants/svg/k.svg", "g": "consonants/svg/g.svg", "f": "consonants/svg/f.svg", "v": "consonants/svg/v.svg",
    "θ": "consonants/svg/θ.svg", "ð": "consonants/svg/eth.svg", "s": "consonants/svg/s_laminal.svg",
    "z": "consonants/svg/z_laminal.svg", "ʃ": "consonants/svg/ʃ_laminal.svg", "ʒ": "consonants/svg/ʒ_apical.svg",
    "m": "consonants/svg/m.svg", "n": "consonants/svg/n.svg", "ŋ": "consonants/svg/ŋ.svg",
    "r": "consonants/svg/r_retroflex.svg",  # 卷舌近音：近似美音 r
}


def main():
    out = ROOT / load_config()["ipa"]["commons_dir"] / "svg"
    out.mkdir(parents=True, exist_ok=True)
    meta = {}
    for sym, rel in FILES.items():
        dst = out / f"{sym}.svg"
        url = f"{RAW}/{urllib.parse.quote(rel)}"
        meta[sym] = {
            "title": rel.split("/")[-1],
            "license": "CC0 1.0",
            "artist": "Richard Wright, Dan McCloy",
            "page": f"https://github.com/{REPO}/blob/main/midsaggital_articulations/{rel}",
        }
        if dst.exists() and dst.stat().st_size > 0:
            continue
        dst.write_bytes(urllib.request.urlopen(url, timeout=60).read())
        print(f"  下载 {sym} ← {rel}")
        time.sleep(2)
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"→ {out}（{len(FILES)} 张）")


if __name__ == "__main__":
    main()
