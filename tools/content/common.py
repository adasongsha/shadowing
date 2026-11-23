"""内容生成脚本的公共工具"""
import json
import subprocess
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent  # 仓库根目录


def load_config():
    return yaml.safe_load((HERE / "config.yaml").read_text(encoding="utf-8"))


def write_json(p: Path, data, compact=False):
    p.parent.mkdir(parents=True, exist_ok=True)
    kw = {"separators": (",", ":")} if compact else {"indent": 1}
    p.write_text(json.dumps(data, ensure_ascii=False, **kw), encoding="utf-8")


def run(*cmd):
    subprocess.run([str(c) for c in cmd], check=True, capture_output=True)
