"""00 解析教材：从 PDF「第二部分：句子训练篇」提取每天的句子和中文翻译 → work/dayXX/script.json

教材格式（每天一块）：
  Day1  Sentences
  Believe me.    相信我。
  Her father is a teacher and her mother is a nurse.      ← 英文太长时，中文翻译换到下一行
  她父亲是位教师，她母亲是个护士。

用法：python 00_script.py [--pdf ../data/raw/scripts/xxx.pdf]
"""
import argparse
import re
from pathlib import Path

from common import day_dir, load_config, write_json

CJK = re.compile(r"[㐀-鿿]")
DAY_HEAD = re.compile(r"^\s*Day\s*(\d+)\s+Sentences", re.I)

# PDF 里的笔误 / 排版问题修正
FIXES = [
    (re.compile(r"[‘’`]"), "'"),
    (re.compile(r"\bIts\b"), "It's"),
    (re.compile(r"\bWhat s\b"), "What's"),
    (re.compile(r"\bMr\.(?=\S)"), "Mr. "),
    (re.compile(r"\s+([,.!?;:])"), r"\1"),
    (re.compile(r"？"), "?"),
    (re.compile(r"！"), "!"),
    (re.compile(r"，"), ","),
    (re.compile(r"\s{2,}"), " "),
]


def clean_en(s):
    s = s.strip()
    for pat, rep in FIXES:
        s = pat.sub(rep, s)
    return s.strip()


def clean_zh(s):
    return re.sub(r"\s+", "", s.strip())


def find_pdf(cfg):
    pdfs = sorted((cfg["paths"]["raw"] / "scripts").glob("*.pdf"))
    if not pdfs:
        raise SystemExit("data/raw/scripts/ 下没有 PDF")
    return pdfs[0]


def extract_text(pdf: Path) -> str:
    from pypdf import PdfReader

    return "\n".join(p.extract_text() or "" for p in PdfReader(str(pdf)).pages)


def parse(text):
    start = text.find("句子训练篇")
    if start < 0:
        raise SystemExit("PDF 里找不到「句子训练篇」")
    # 句子训练篇之后是「连略读技巧」，到那里为止
    end = text.find("连略读技巧", start)
    if end > 0:
        text = text[:end]
    days = {}
    cur = None
    pending = None  # 只有英文、还没配上中文的句子
    for raw in text[start:].splitlines():
        line = raw.strip()
        if not line or re.fullmatch(r"\d+", line):  # 空行 / 页码
            continue
        m = DAY_HEAD.match(line)
        if m:
            cur = days.setdefault(int(m.group(1)), [])
            pending = None
            continue
        if cur is None:
            continue
        if not re.search(r"[A-Za-z]", line):
            # 纯中文行：上一句英文的翻译
            if pending is not None:
                pending["zh"] = clean_zh(line)
                pending = None
            continue
        # 英文在前，中文在后（可能在同一行）
        k = CJK.search(line)
        en, zh = (line[: k.start()], line[k.start():]) if k else (line, "")
        item = {"text": clean_en(en), "zh": clean_zh(zh)}
        cur.append(item)
        pending = None if zh else item
    return days


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pdf")
    args = ap.parse_args()
    cfg = load_config()
    pdf = Path(args.pdf) if args.pdf else find_pdf(cfg)
    days = parse(extract_text(pdf))
    for d, items in sorted(days.items()):
        write_json(day_dir(cfg["paths"]["work"], d) / "script.json", items)
        print(f"Day {d:>2}: {len(items)} 句")
        for it in items:
            print(f"        {it['text']:<55} {it['zh']}")
    print(f"\n共 {len(days)} 天 / {sum(map(len, days.values()))} 句")
