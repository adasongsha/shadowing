"""查词数据：ECDICT（MIT，中文释义 / 考试标签 / 词形变化）+ CMUdict（BSD，美音发音）
→ app/public/content/dict/<首字母>.json

每个分片是一个对象：
  "apple": ["ˈæpəl", "n. 苹果...", "zk gk"]   # [美音 IPA, 中文释义, 考试标签]
  "apples": "@apple"                          # 词形变化 → 原形

用法：python build_dict.py   （参数见 config.yaml 的 dict 段）
需要先把 ecdict.csv、cmudict.dict 下载到 data/dict/（见 README）
"""
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

from common import ROOT, load_config

# ---------------- ARPAbet → IPA（美音） ----------------
VOWELS = {
    "IY": "i", "IH": "ɪ", "EY": "eɪ", "EH": "ɛ", "AE": "æ", "AA": "ɑ", "AO": "ɔ", "OW": "oʊ",
    "UH": "ʊ", "UW": "u", "AW": "aʊ", "AY": "aɪ", "OY": "ɔɪ",
}
CONS = {
    "P": "p", "B": "b", "T": "t", "D": "d", "K": "k", "G": "g", "F": "f", "V": "v", "TH": "θ", "DH": "ð",
    "S": "s", "Z": "z", "SH": "ʃ", "ZH": "ʒ", "HH": "h", "CH": "tʃ", "JH": "dʒ", "M": "m", "N": "n",
    "NG": "ŋ", "L": "l", "R": "r", "W": "w", "Y": "j",
}
# 英语里合法的词首辅音组合（用来决定重音符号放在哪个辅音前）
ONSETS = {
    "p r", "b r", "t r", "d r", "k r", "g r", "f r", "θ r", "ʃ r", "p l", "b l", "k l", "g l", "f l", "s l",
    "s p", "s t", "s k", "s m", "s n", "s w", "t w", "d w", "k w", "s p r", "s t r", "s k r", "s p l", "s k w",
    "p j", "b j", "k j", "f j", "m j", "h j", "v j",
}


def vowel_ipa(base, stress):
    if base == "AH":
        return "ʌ" if stress in "12" else "ə"
    if base == "ER":
        return "ɝ" if stress in "12" else "ɚ"
    return VOWELS[base]


def arpabet_to_ipa(phones: list[str]) -> str:
    segs = []  # (ipa, is_vowel, stress)
    for p in phones:
        m = re.match(r"([A-Z]+)([012])?$", p)
        base, st = m.group(1), m.group(2) or ""
        if st:
            segs.append([vowel_ipa(base, st), True, st])
        else:
            segs.append([CONS[base], False, ""])
    if sum(s[1] for s in segs) <= 1:  # 单音节词不标重音
        return "".join(s[0] for s in segs)
    out = [s[0] for s in segs]
    marks = {}
    prev_v = -1
    for i, (ipa, is_v, st) in enumerate(segs):
        if not is_v:
            continue
        if st in "12":
            # 重音符号放在本音节的起始辅音前：取最长的合法辅音组合（至少一个辅音，不越过前一个元音）
            cons = list(range(prev_v + 1, i))
            start = i
            for k in range(len(cons)):
                cand = cons[k:]
                if len(cand) == 1 or " ".join(segs[j][0] for j in cand) in ONSETS:
                    start = cand[0]
                    break
            marks[start] = "ˈ" if st == "1" else "ˌ"
        prev_v = i
    return "".join(marks.get(i, "") + s for i, s in enumerate(out))


def load_cmudict(path: Path):
    d = {}
    for line in path.read_text(encoding="latin-1").splitlines():
        line = line.split("#")[0].strip()
        if not line:
            continue
        word, *phones = line.split()
        if "(" in word:  # 只取第一个读音
            continue
        d[word.lower()] = arpabet_to_ipa(phones)
    return d


def clean_translation(t: str, max_lines: int):
    lines = [x.strip() for x in t.replace("\\n", "\n").split("\n") if x.strip()]
    main = [x for x in lines if not x.startswith("[")]
    return "\n".join((main or lines)[:max_lines])


WORD = re.compile(r"^[a-z][a-z'-]*$")


def main():
    cfg = load_config()["dict"]
    src = ROOT / cfg["src_dir"]
    out = ROOT / cfg["out_dir"]
    cmu = load_cmudict(src / "cmudict.dict")
    print(f"CMUdict：{len(cmu)} 词")

    entries = {}
    forms = {}
    with open(src / "ecdict.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            w = r["word"].strip()
            lw = w.lower()
            if not WORD.match(lw) or not r["translation"].strip():
                continue
            frq = int(r["frq"] or 0)
            bnc = int(r["bnc"] or 0)
            rank = min(x for x in (frq, bnc, 10**9) if x > 0)
            tags = r["tag"].strip()
            if rank > cfg["max_rank"] and not tags:
                continue
            if lw in entries and entries[lw]["rank"] <= rank:
                continue
            ipa = cmu.get(lw) or r["phonetic"].strip()
            entries[lw] = {"rank": rank, "v": [ipa, clean_translation(r["translation"], cfg["max_lines"]), tags]}
            # exchange 形如 p:went/d:gone/i:going/3:goes/s:apples
            for part in r["exchange"].split("/"):
                if ":" in part:
                    k, v = part.split(":", 1)
                    v = v.strip().lower()
                    if k in "pdi3sre" and WORD.match(v) and v != lw:
                        forms.setdefault(v, lw)

    shards = defaultdict(dict)
    for w, e in entries.items():
        shards[w[0]][w] = e["v"]
    n_forms = 0
    for v, base in forms.items():
        if v not in entries and base in entries:
            shards[v[0]][v] = "@" + base
            n_forms += 1

    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.json"):
        old.unlink()
    total = 0
    for k, d in sorted(shards.items()):
        p = out / f"{k}.json"
        p.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        total += p.stat().st_size
    print(f"词条 {len(entries)}，词形 {n_forms}，{len(shards)} 个分片，共 {total / 1e6:.1f}MB → {out}")


if __name__ == "__main__":
    main()
