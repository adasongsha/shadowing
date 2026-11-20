"""M1 用：用 macOS 自带的 `say` 合成几句英文，做一个测试课程包。
输出 data/packs/test-pack.zip，格式与正式课程包（SPEC 2.6）完全一致。

用法：python3 tools/make_test_pack.py
依赖：macOS `say`、ffmpeg
"""
import json
import shutil
import subprocess
import tempfile
import zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "packs" / "test-pack.zip"
VOICE = "Samantha"  # 美式英语女声；`say -v '?'` 可查看其它声音

DAYS = {
    1: [("How's it going?", "最近怎么样？"), ("I'm running a little late today.", "我今天要晚一点到。"),
        ("Could you say that again, please?", "请你再说一遍好吗？")],
    2: [("What do you do for a living?", "你是做什么工作的？"), ("It's been a long week, hasn't it?", "这一周可真漫长，是吧？")],
}


def run(*cmd):
    subprocess.run(cmd, check=True, capture_output=True)


def duration(p: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
        check=True, capture_output=True, text=True,
    ).stdout
    return round(float(out.strip()), 2)


def main():
    tmp = Path(tempfile.mkdtemp())
    try:
        days = []
        files = []
        for day, sentences in DAYS.items():
            items = []
            for i, (text, zh) in enumerate(sentences, 1):
                sid = f"day{day:02d}_s{i:03d}"
                aiff = tmp / f"{sid}.aiff"
                m4a = tmp / f"{sid}.m4a"
                run("say", "-v", VOICE, "-o", str(aiff), text)
                # 与正式流水线 04_cut 一致：前后留白、30ms 淡入淡出、响度归一、AAC 单声道
                run(
                    "ffmpeg", "-y", "-i", str(aiff),
                    "-af", "adelay=250,apad=pad_dur=0.35,afade=t=in:d=0.03,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100",
                    "-ac", "1", "-c:a", "aac", "-b:a", "80k", str(m4a),
                )
                items.append({"id": sid, "text": text, "zh": zh, "audio": f"audio/{sid}.m4a", "duration": duration(m4a)})
                files.append(m4a)
            days.append({"day": day, "title": f"Day {day}", "sentences": items})

        manifest = {
            "schema": 1,
            "course_id": "test-pack",
            "title": "测试课程包",
            "created_at": date.today().isoformat(),
            "days": days,
        }
        OUT.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(OUT, "w") as z:
            z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
            for f in files:
                # m4a 已压缩，存储即可
                z.write(f, f"audio/{f.name}", compress_type=zipfile.ZIP_STORED)
        print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB, {len(files)} 句)")
    finally:
        shutil.rmtree(tmp)


if __name__ == "__main__":
    main()
