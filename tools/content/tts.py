"""Kokoro 语音合成（kokoro-onnx，Apache 2.0）→ 响度统一的 m4a

用法：python tts.py "Hello there." out.m4a
"""
import sys
import tempfile
from functools import lru_cache
from pathlib import Path

import numpy as np
import soundfile as sf

from common import ROOT, load_config, run


@lru_cache(maxsize=1)
def engine():
    from kokoro_onnx import Kokoro

    c = load_config()["tts"]
    return Kokoro(str(ROOT / c["model"]), str(ROOT / c["voices"]))


def trim(samples, sr, thr_db=-45, pad=0.12):
    """去掉首尾静音，各留 pad 秒"""
    frame = int(sr * 0.01)
    n = len(samples) // frame
    if n == 0:
        return samples
    rms = np.sqrt(np.mean(samples[: n * frame].reshape(n, frame) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(rms)
    loud = np.where(db > db.max() + thr_db)[0]
    if not len(loud):
        return samples
    a = max(0, loud[0] * frame - int(pad * sr))
    b = min(len(samples), (loud[-1] + 1) * frame + int(pad * sr))
    return samples[a:b]


def synth(text: str, out: Path, voice: str | None = None, speed: float | None = None) -> float:
    """合成一句话写到 out（.m4a），返回时长（秒）"""
    c = load_config()["tts"]
    samples, sr = engine().create(text, voice=voice or c["voice"], speed=speed or c["speed"], lang=c["lang"])
    samples = trim(np.asarray(samples, dtype=np.float32), sr)
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "a.wav"
        sf.write(wav, samples, sr)
        dur = len(samples) / sr
        fade = 0.03
        run("ffmpeg", "-y", "-v", "error", "-i", wav,
            "-af", f"loudnorm=I={c['loudnorm_i']}:TP=-1.5:LRA=11,afade=t=in:d={fade},afade=t=out:st={max(0, dur - fade):.3f}:d={fade}",
            "-ar", "44100", "-ac", "1", "-c:a", "aac", "-b:a", c["bitrate"], out)
    return round(dur, 2)


if __name__ == "__main__":
    print(synth(sys.argv[1], Path(sys.argv[2])))
