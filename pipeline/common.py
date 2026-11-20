"""流水线公共工具：读配置、路径、Day 解析、ffmpeg 调用。"""
import json
import re
import subprocess
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent


def load_config():
    cfg = yaml.safe_load((HERE / "config.yaml").read_text())
    for k, v in cfg["paths"].items():
        cfg["paths"][k] = (HERE / v).resolve()
    return cfg


def parse_days(spec, raw_dir: Path):
    """'1' / '1-5' / '1,3,7' / 'all' → [1, 2, ...]"""
    if spec in (None, "all"):
        return sorted(int(m.group(1)) for p in raw_dir.iterdir() if (m := re.fullmatch(r"day(\d+)", p.name)))
    out = set()
    for part in str(spec).split(","):
        if "-" in part:
            a, b = part.split("-")
            out.update(range(int(a), int(b) + 1))
        else:
            out.add(int(part))
    return sorted(out)


def day_dir(base: Path, day: int) -> Path:
    return base / f"day{day:02d}"


def run(cmd, capture=False):
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"命令失败：{' '.join(map(str, cmd))}\n{r.stderr[-2000:]}")
    return r.stderr if capture else None


def ffprobe_duration(p: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
        capture_output=True, text=True, check=True,
    ).stdout
    return float(out.strip())


def read_json(p: Path):
    return json.loads(Path(p).read_text())


def write_json(p: Path, data):
    p.parent.mkdir(parents=True, exist_ok=True)
    Path(p).write_text(json.dumps(data, ensure_ascii=False, indent=2))


def day_arg_parser(desc):
    import argparse

    ap = argparse.ArgumentParser(description=desc)
    ap.add_argument("--day", "--days", dest="days", default="all", help="例如 1、1-5、1,3,7 或 all")
    return ap
