# Builds assets/own-capes/capewatch-test.png: a 64x32 cape texture drawn by CapeWatch itself
# (random night-sky pattern from a fixed seed, a star emblem, and the elytra part). Not game art.
import random, struct, zlib
from pathlib import Path
random.seed(20261002)
W, H = 64, 32
px = [[(0, 0, 0, 0)] * W for _ in range(H)]
def sky(x, y, top, h):
    t = (y - top) / max(1, h - 1)
    base = (int(40 + 60 * t), int(20 + 30 * t), int(90 + 70 * t))
    if random.random() < 0.10:
        return (230, 220, 255, 255) if random.random() < 0.5 else (255, 210, 120, 255)
    j = random.randint(-8, 8)
    return (max(0, base[0] + j), max(0, base[1] + j), min(255, base[2] + j), 255)
for y in range(0, 17):          # cape: top/bottom strip (row 0) and the 22x16 faces/sides (rows 1-16)
    for x in range(0, 22):
        if y == 0 and not (1 <= x <= 20): continue
        px[y][x] = sky(x, y, 0, 17)
for y in range(0, 22):          # elytra part
    for x in range(22, 46):
        if y < 2 and not (24 <= x <= 33): continue
        px[y][x] = sky(x, y, 0, 22)
STAR = ["..#..", ".###.", "#####", ".###.", "#.#.#"]
for fx in (1, 12):              # emblem on both big faces of the cape
    for j, row in enumerate(STAR):
        for i, ch in enumerate(row):
            if ch == '#': px[5 + j][fx + 3 + i] = (255, 200, 60, 255)
raw = b''.join(b'\0' + bytes(c for p in row for c in p) for row in px)
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
out = Path(__file__).resolve().parent.parent / 'assets' / 'own-capes' / 'capewatch-test.png'
out.write_bytes(png); print('wrote', out)
