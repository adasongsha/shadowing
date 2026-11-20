"""一键跑完整流程：00 教材 → 01 提取 → 02 转写 → 03 选句 → 04 切分 → 06 打包

用法：
  python run_all.py --day 1          # 跑 Day 1，输出 data/packs/oral-sentences_day01.zip
  python run_all.py --day 1-5        # 跑 Day 1～5，打成一个包
  python run_all.py --day 1 --from 03  # 从第 03 步开始（前面的结果复用）
"""
import subprocess
import sys
from pathlib import Path

from common import day_arg_parser, load_config

HERE = Path(__file__).resolve().parent
STEPS = ["00_script", "01_extract", "02_transcribe", "03_select", "04_cut", "06_pack"]

if __name__ == "__main__":
    ap = day_arg_parser(__doc__)
    ap.add_argument("--from", dest="start", default="00", help="从哪一步开始，例如 03")
    args = ap.parse_args()
    cfg = load_config()
    has_pdf = any((cfg["paths"]["raw"] / "scripts").glob("*.pdf")) if (cfg["paths"]["raw"] / "scripts").exists() else False
    for step in STEPS:
        if step[:2] < args.start:
            continue
        if step == "00_script":
            if not has_pdf:
                print("== 00_script：没有教材 PDF，跳过（03 将使用规则模式）")
                continue
            cmd = [sys.executable, HERE / f"{step}.py"]
        else:
            cmd = [sys.executable, HERE / f"{step}.py", "--day", args.days]
        print(f"\n== {step}")
        r = subprocess.run([str(c) for c in cmd], cwd=HERE)
        if r.returncode != 0:
            sys.exit(f"{step} 失败")
    print("\n全部完成。")
