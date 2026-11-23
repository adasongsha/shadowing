"""连读 / 弱读 / 闪音 / 省略 自动标注（美音，基于 CMUdict + 规则）

输出：[{type, from, to, note}]，from/to 是英文原文里的字符位置（左闭右开）
  link   连读：前一词结尾到后一词开头，from 指向前词最后一个字母，to 指向后词第一个字母之后
  weak   弱读：整个功能词
  flap   闪音：t / tt 所在的字母
  elide  省略或不爆破：t / d 所在的字母

自动规则大约能覆盖七八成，剩下的在 sentences.yaml 的 hints_override 里手工改。

用法：
  python hints.py "Pick it up."            # 打印标注结果
  python hints.py --file selected.json     # 给私人课程的 selected.json 每句补 hints 字段（原地写回）
"""
import argparse
import json
import re
from functools import lru_cache
from pathlib import Path

from common import ROOT, load_config

VOWEL_PH = {"AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"}
STOPS = {"P", "B", "T", "D", "K", "G"}

# 常见功能词的弱读形式（美音）
WEAK = {
    "a": "ə", "an": "ən", "the": "ðə", "to": "tə", "of": "əv", "and": "ən", "or": "ɚ", "for": "fɚ",
    "from": "frəm", "at": "ət", "as": "əz", "can": "kən", "could": "kəd", "would": "wəd", "should": "ʃəd",
    "will": "əl", "do": "də", "does": "dəz", "have": "həv", "has": "həz", "had": "həd", "was": "wəz",
    "were": "wɚ", "are": "ɚ", "am": "əm", "been": "bɪn", "you": "jə", "your": "jɚ",
    "them": "ðəm", "him": "ɪm", "her": "ɚ", "his": "ɪz", "us": "əs", "some": "səm", "than": "ðən",
    "but": "bət",
}
# 助动词 / 情态动词放在句首（一般疑问句）时读强式
AUX = {"can", "could", "would", "should", "will", "do", "does", "have", "has", "had", "was", "were", "are", "am"}


@lru_cache(maxsize=1)
def cmu() -> dict[str, list[str]]:
    d = {}
    path = ROOT / load_config()["dict"]["src_dir"] / "cmudict.dict"
    for line in path.read_text(encoding="latin-1").splitlines():
        line = line.split("#")[0].strip()
        if not line:
            continue
        w, *ph = line.split()
        if "(" not in w:
            d[w.lower()] = [re.sub(r"\d", "", p) for p in ph]
    return d


TOKEN = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")


def tokens(text):
    """[(word, start, end, gap_after)]；gap_after = 到下一个词之间的字符（看有没有标点）"""
    ms = list(TOKEN.finditer(text))
    out = []
    for i, m in enumerate(ms):
        nxt = ms[i + 1].start() if i + 1 < len(ms) else len(text)
        out.append((m.group(), m.start(), m.end(), text[m.end():nxt]))
    return out


def phones(word):
    return cmu().get(word.lower())


def last_letter(text, start, end, letters):
    """在 [start, end) 里从后往前找第一个属于 letters 的字母位置"""
    for i in range(end - 1, start - 1, -1):
        if text[i].lower() in letters:
            return i
    return None


def annotate(text: str):
    toks = tokens(text)
    hints = []
    for i, (w, s, e, gap) in enumerate(toks):
        lw = w.lower()
        ph = phones(w)
        is_last = i == len(toks) - 1
        nxt = toks[i + 1] if not is_last else None
        nph = phones(nxt[0]) if nxt else None
        joined = nxt is not None and gap.strip() == ""  # 中间没有标点

        # ---- 弱读 ----
        strong = (
            is_last
            or (not joined and lw not in {"a", "an", "the"})  # 后面有标点
            or (i == 0 and lw in AUX)  # 句首助动词：Can I ...?
            or (lw in {"have", "has", "had"} and nxt and nxt[0].lower() in {"a", "an", "the", "to"})  # 实义动词 have
        )
        if lw in WEAK and not strong:
            form = WEAK[lw]
            if lw == "the" and nph and nph[0] in VOWEL_PH:
                form = "ði"
            hints.append({"type": "weak", "from": s, "to": e, "note": f"弱读 /{form}/"})

        # ---- 词内闪音：元音（或 r）+ t + 非重读元音 ----
        if ph:
            raw = cmu_raw(w)
            for k in range(1, len(raw) - 1):
                if raw[k] == "T" and (strip(raw[k - 1]) in VOWEL_PH or raw[k - 1] == "R") \
                        and strip(raw[k + 1]) in VOWEL_PH and raw[k + 1][-1] == "0":
                    pos = text.lower().find("tt", s, e)
                    if pos < 0:
                        pos = last_letter(text, s, e, "t")
                    if pos is not None:
                        hints.append({"type": "flap", "from": pos, "to": pos + (2 if text[pos:pos + 2].lower() == "tt" else 1),
                                      "note": "闪音：t 夹在元音之间，舌尖快速轻弹一下，听起来像轻 d"})
                    break

        if not (joined and ph and nph):
            continue
        end_ph, start_ph = ph[-1], nph[0]
        ns = nxt[1]

        # ---- 跨词：t + 元音 → 闪音；t/d + y → 同化；辅音 + 元音 → 连读 ----
        if end_ph in {"T", "D"} and start_ph == "Y":
            pos = last_letter(text, s, e, "td")
            sound = "tʃ" if end_ph == "T" else "dʒ"
            hints.append({"type": "link", "from": pos, "to": ns + 1, "note": f"同化：{text[pos]} + y 连起来读成 /{sound}/"})
        elif start_ph in VOWEL_PH and end_ph not in VOWEL_PH:
            if end_ph == "T" and len(ph) > 1 and (ph[-2] in VOWEL_PH or ph[-2] == "R"):
                pos = last_letter(text, s, e, "t")
                hints.append({"type": "flap", "from": pos, "to": pos + 1, "note": "闪音：词尾 t 后面接元音，读成轻 d 并和后词连读"})
            pos = last_letter(text, s, e, "abcdfghjklmnpqrstvwxz")
            if pos is not None:
                hints.append({"type": "link", "from": pos, "to": ns + 1, "note": "连读：前词结尾的辅音直接接到后词的元音上"})
        elif start_ph in VOWEL_PH and end_ph in VOWEL_PH:
            glide = "w" if end_ph in {"UW", "OW", "AW"} else "j" if end_ph in {"IY", "EY", "AY", "OY"} else None
            if glide:
                hints.append({"type": "link", "from": e - 1, "to": ns + 1, "note": f"连读：两个元音之间自然带出一个轻 /{glide}/"})
        # ---- 辅音前的 t / d：省略或不爆破 ----
        elif end_ph in {"T", "D"} and start_ph not in VOWEL_PH:
            pos = last_letter(text, s, e, "td")
            if pos is None:
                continue
            if len(ph) > 1 and ph[-2] not in VOWEL_PH and ph[-2] != "R":
                note = f"省略：{text[pos]} 夹在两个辅音之间，通常不发音"
            else:
                note = f"不爆破：{text[pos]} 只做口型、不送气，马上接下一个词"
            hints.append({"type": "elide", "from": pos, "to": pos + 1, "note": note})

    hints.sort(key=lambda h: (h["from"], h["to"]))
    return hints


@lru_cache(maxsize=None)
def _raw_dict():
    d = {}
    path = ROOT / load_config()["dict"]["src_dir"] / "cmudict.dict"
    for line in path.read_text(encoding="latin-1").splitlines():
        line = line.split("#")[0].strip()
        if line:
            w, *ph = line.split()
            if "(" not in w:
                d[w.lower()] = ph
    return d


def cmu_raw(word):
    return _raw_dict().get(word.lower(), [])


def strip(p):
    return re.sub(r"\d", "", p)


def show(text, hints):
    for h in hints:
        print(f"  {h['type']:5} {text[h['from']:h['to']]!r:12} {h['note']}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("text", nargs="*")
    ap.add_argument("--file", type=Path, help="selected.json 或 cut.json，原地补 hints 字段")
    a = ap.parse_args()
    if a.file:
        data = json.loads(a.file.read_text(encoding="utf-8"))
        for s in data:
            s["hints"] = annotate(s["text"])
        a.file.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"已为 {len(data)} 句补上 hints → {a.file}")
    for t in a.text:
        print(t)
        show(t, annotate(t))
