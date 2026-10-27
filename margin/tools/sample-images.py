"""Draw the sample people's avatars: soft abstract shapes, no faces, no logos. (Sample posts
use drawn covers from api/covers.js; tools/cover-pngs.mjs renders their social images.)

Run from the repository root with a Python that has Pillow:
    python3 margin/tools/sample-images.py
Writes JPEGs into margin/web/samples/.
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'web', 'samples')
os.makedirs(OUT, exist_ok=True)

PALETTES = [
    ['#0f2a3a', '#17475e', '#2f7f86', '#9fd3c7', '#f4f1ea'],
    ['#1b1b3a', '#693668', '#a74482', '#f84aa7', '#ffd6e8'],
    ['#0b3954', '#087e8b', '#bfd7ea', '#ff5a5f', '#c81d25'],
    ['#2d1e2f', '#5c3c48', '#c5a880', '#efe1c6', '#f7f3ea'],
    ['#132a13', '#31572c', '#4f772d', '#90a955', '#ecf39e'],
    ['#03045e', '#0077b6', '#00b4d8', '#90e0ef', '#caf0f8'],
    ['#3d405b', '#e07a5f', '#f2cc8f', '#81b29a', '#f4f1de'],
    ['#22223b', '#4a4e69', '#9a8c98', '#c9ada7', '#f2e9e4'],
]


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def gradient(w, h, a, b, angle):
    img = Image.new('RGB', (w, h))
    px = img.load()
    ca, cb = hex_rgb(a), hex_rgb(b)
    dx, dy = math.cos(angle), math.sin(angle)
    span = abs(dx) * w + abs(dy) * h
    for y in range(h):
        for x in range(w):
            t = ((x * dx + y * dy) - min(0, dx * w) - min(0, dy * h)) / span
            t = max(0.0, min(1.0, t))
            px[x, y] = tuple(int(ca[i] + (cb[i] - ca[i]) * t) for i in range(3))
    return img


def avatar(index, size=320):
    rnd = random.Random(index * 104729)
    pal = PALETTES[(index * 3 + 1) % len(PALETTES)]
    img = gradient(size // 4, size // 4, pal[1], pal[3], rnd.uniform(0, math.pi)).resize((size, size), Image.BICUBIC).convert('RGBA')
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(3):
        r = rnd.randint(size // 6, size // 3)
        cx, cy = rnd.randint(0, size), rnd.randint(0, size)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=hex_rgb(rnd.choice(pal)) + (150,))
    layer = layer.filter(ImageFilter.GaussianBlur(radius=size // 10))
    return Image.alpha_composite(img, layer).convert('RGB')


if __name__ == '__main__':
    for i in range(11):
        avatar(i).save(os.path.join(OUT, f'avatar-{i + 1}.jpg'), quality=85, optimize=True)
    print('ok')
