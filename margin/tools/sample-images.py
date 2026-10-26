"""Draw the sample content's covers and avatars: soft abstract shapes, no people, no logos.

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


def cover(index, w=1600, h=1000):
    rnd = random.Random(index * 7919)
    pal = PALETTES[index % len(PALETTES)]
    small = gradient(w // 8, h // 8, pal[0], pal[1], rnd.uniform(0, math.pi))
    img = small.resize((w, h), Image.BICUBIC)
    layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(5):
        r = rnd.randint(h // 5, h // 2)
        cx, cy = rnd.randint(0, w), rnd.randint(0, h)
        col = hex_rgb(rnd.choice(pal[2:]))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col + (rnd.randint(90, 170),))
    layer = layer.filter(ImageFilter.GaussianBlur(radius=rnd.randint(60, 110)))
    img = Image.alpha_composite(img.convert('RGBA'), layer)
    # One quiet motif per cover; the app in the samples is a calendar.
    grid = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    g = ImageDraw.Draw(grid)
    motif = index % 4
    if motif == 0:  # a month of days, one picked out
        cols, rows = 7, 5
        gw, gh = int(w * 0.46), int(h * 0.5)
        ox, oy = rnd.randint(int(w * 0.08), int(w * 0.46)), rnd.randint(int(h * 0.18), int(h * 0.36))
        cell_w, cell_h = gw / cols, gh / rows
        accent = rnd.randrange(cols * rows)
        for i in range(cols * rows):
            x0 = ox + (i % cols) * cell_w + 5
            y0 = oy + (i // cols) * cell_h + 5
            fill = (255, 255, 255, 235) if i == accent else (255, 255, 255, 34)
            g.rounded_rectangle([x0, y0, x0 + cell_w - 10, y0 + cell_h - 10], radius=14, fill=fill)
    elif motif == 1:  # rings, like a week seen from above
        cx, cy = rnd.randint(int(w * 0.35), int(w * 0.65)), rnd.randint(int(h * 0.4), int(h * 0.6))
        for k in range(7, 0, -1):
            r = k * h * 0.06
            g.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255, 40 + k * 10), width=3)
        g.ellipse([cx - 16, cy - 16, cx + 16, cy + 16], fill=(255, 255, 255, 235))
    elif motif == 2:  # a timeline of bars
        y = int(h * 0.26)
        for k in range(6):
            x0 = int(w * rnd.uniform(0.1, 0.35))
            x1 = x0 + int(w * rnd.uniform(0.18, 0.5))
            fill = (255, 255, 255, 230) if k == 2 else (255, 255, 255, 50)
            g.rounded_rectangle([x0, y, x1, y + 56], radius=28, fill=fill)
            y += 92
    else:  # dots joined by thin lines
        pts = [(rnd.randint(int(w * 0.12), int(w * 0.88)), rnd.randint(int(h * 0.2), int(h * 0.8))) for _ in range(7)]
        for a, b in zip(pts, pts[1:]):
            g.line([a, b], fill=(255, 255, 255, 90), width=3)
        for i, (x, y) in enumerate(pts):
            r = 20 if i == 3 else 11
            g.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, 235 if i == 3 else 150))
    img = Image.alpha_composite(img, grid)
    return img.convert('RGB')


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
    for i in range(8):
        cover(i).save(os.path.join(OUT, f'cover-{i + 1}.jpg'), quality=82, optimize=True, progressive=True)
    for i in range(8):
        avatar(i).save(os.path.join(OUT, f'avatar-{i + 1}.jpg'), quality=85, optimize=True)
    print('ok')
