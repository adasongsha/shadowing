"""生成 PWA 图标（纯 Python，无第三方依赖）：蓝底 + 两组白色声波条（原音 / 我的）。
用法：python3 tools/make_icons.py
"""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "app" / "public" / "icons"
BG = (47, 111, 219)
FG = (255, 255, 255)
FG2 = (180, 205, 248)
# 声波条：(中心 x, 半高)，坐标为 0..1 的相对值
BARS_L = [(0.22, 0.10), (0.30, 0.20), (0.38, 0.28), (0.46, 0.16)]
BARS_R = [(0.56, 0.14), (0.64, 0.26), (0.72, 0.19), (0.80, 0.09)]
HALF_W = 0.028


def inside(x, y):
    """返回该点颜色（None 表示背景）"""
    for bars, col in ((BARS_L, FG), (BARS_R, FG2)):
        for cx, hh in bars:
            dx = abs(x - cx)
            if dx > HALF_W:
                continue
            dy = abs(y - 0.5) - (hh - HALF_W)
            if dy <= 0 or dx * dx + dy * dy <= HALF_W * HALF_W:
                return col
    return None


def render(size, ss=4):
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    c = inside((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size) or BG
                    for i in range(3):
                        acc[i] += c[i]
            row += bytes(v // (ss * ss) for v in acc)
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, size in (("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)):
        (OUT / name).write_bytes(render(size, ss=3 if size > 200 else 4))
        print("wrote", OUT / name)
