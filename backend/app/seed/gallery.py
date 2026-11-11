"""Генератор синтетической тестовой галереи (без реальных людей и чужих фото).

Сцены рисуются процедурно; часть кадров специально «с браком»: дубли, размытие, темнота,
низкое разрешение — чтобы показать работу Кота-куратора и Робота-ОТК."""
from __future__ import annotations

import json
import math
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from ..config import MEDIA_DIR

GALLERY_DIR = MEDIA_DIR / "gallery"


def _grad(w: int, h: int, stops: list[tuple[float, tuple[int, int, int]]]) -> np.ndarray:
    y = np.linspace(0, 1, h)[:, None]
    out = np.zeros((h, 1, 3), np.float32)
    for c in range(3):
        xs = [s[0] for s in stops]
        ys = [s[1][c] for s in stops]
        out[:, 0, c] = np.interp(y[:, 0], xs, ys)
    return np.repeat(out, w, axis=1)


def _finish(arr: np.ndarray, rng: random.Random, grain: float = 7.0) -> Image.Image:
    noise = np.random.default_rng(rng.randint(0, 10**6)).normal(0, grain, arr.shape[:2])[..., None]
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr)
    return img


def _ridge(w: int, h: int, base: float, amp: float, rng: random.Random, freq: float = 3.0) -> np.ndarray:
    xs = np.linspace(0, 1, w)
    y = np.full(w, base, np.float32)
    for k in range(1, 6):
        y += amp / k * np.sin(xs * math.pi * freq * k + rng.random() * 6)
    return (y * h).astype(int)


def sea_sunset(w: int, h: int, rng: random.Random) -> Image.Image:
    hue = rng.uniform(-18, 18)
    sky = _grad(w, h, [(0, (40, 30 + hue, 90)), (0.35, (220, 90 + hue, 90)), (0.55, (255, 190 + hue / 2, 110)),
                       (0.56, (40, 70, 120)), (1, (10, 25, 60))])
    img = Image.fromarray(sky.astype(np.uint8))
    d = ImageDraw.Draw(img, "RGBA")
    horizon = int(h * 0.555)
    sx, sr = int(w * rng.uniform(0.25, 0.75)), int(min(w, h) * rng.uniform(0.06, 0.1))
    sy = int(horizon - sr * rng.uniform(0.3, 1.6))
    for r in range(sr * 4, sr, -max(2, sr // 10)):
        d.ellipse([sx - r, sy - r, sx + r, sy + r], fill=(255, 200, 120, 10))
    d.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], fill=(255, 236, 190, 255))
    d.rectangle([0, horizon, w, h], fill=(18, 40, 78, 255))
    for i in range(260):
        y = rng.randint(horizon, h)
        t = (y - horizon) / (h - horizon)
        ln = int(w * (0.05 + 0.25 * t) * rng.random())
        x = int(sx + rng.gauss(0, w * (0.05 + 0.2 * t)))
        a = int(180 * (1 - t) + 40)
        d.line([x - ln // 2, y, x + ln // 2, y], fill=(255, 190, 120, a), width=max(1, int(3 * t + 1)))
    for i in range(120):
        y = rng.randint(horizon, h)
        x = rng.randint(0, w)
        d.line([x, y, x + rng.randint(20, 140), y], fill=(120, 160, 210, 60), width=2)
    if rng.random() < 0.6:  # силуэт пальмы/пирса
        px = int(w * rng.choice([0.12, 0.85]))
        d.rectangle([px - 6, int(h * 0.25), px + 6, horizon + 30], fill=(10, 10, 20, 255))
        for k in range(7):
            ang = -math.pi / 2 + (k - 3) * 0.45
            d.line([px, int(h * 0.25), px + int(math.cos(ang) * w * 0.12), int(h * 0.25) + int(math.sin(ang) * -h * 0.04 + h * 0.06)],
                   fill=(10, 10, 20, 255), width=10)
    return _finish(np.asarray(img).astype(np.float32), rng)


def lake_forest(w: int, h: int, rng: random.Random) -> Image.Image:
    sky = _grad(w, h, [(0, (120, 170, 220)), (0.5, (220, 230, 235)), (0.62, (90, 130, 140)), (1, (30, 60, 70))])
    img = Image.fromarray(sky.astype(np.uint8))
    d = ImageDraw.Draw(img, "RGBA")
    for layer, (col, base, amp) in enumerate([((70, 110, 120), 0.42, 0.03), ((40, 80, 70), 0.48, 0.025),
                                              ((22, 50, 40), 0.55, 0.02)]):
        ys = _ridge(w, h, base, amp, rng, freq=4 + layer)
        pts = [(x, int(ys[x])) for x in range(0, w, 6)] + [(w, h), (0, h)]
        d.polygon(pts, fill=col + (255,))
        for _ in range(int(w / 18)):  # ёлочки
            x = rng.randint(0, w - 1)
            top = int(ys[x]) - rng.randint(int(h * 0.02), int(h * 0.08))
            bw = rng.randint(int(w * 0.006), int(w * 0.014))
            d.polygon([(x, top), (x - bw, int(ys[x]) + 4), (x + bw, int(ys[x]) + 4)], fill=col + (255,))
    water_top = int(h * 0.6)
    d.rectangle([0, water_top, w, h], fill=(60, 100, 115, 200))
    for _ in range(300):
        y = rng.randint(water_top, h)
        x = rng.randint(0, w)
        d.line([x, y, x + rng.randint(10, 90), y], fill=(200, 225, 235, 70), width=2)
    for _ in range(14):  # облака
        cx, cy = rng.randint(0, w), rng.randint(int(h * 0.05), int(h * 0.3))
        for k in range(6):
            r = rng.randint(int(h * 0.03), int(h * 0.07))
            d.ellipse([cx + k * r // 2 - r, cy - r // 2, cx + k * r // 2 + r, cy + r // 2], fill=(255, 255, 255, 50))
    return _finish(np.asarray(img).astype(np.float32), rng)


def city_night(w: int, h: int, rng: random.Random) -> Image.Image:
    sky = _grad(w, h, [(0, (8, 10, 30)), (0.6, (40, 30, 70)), (1, (20, 18, 30))])
    img = Image.fromarray(sky.astype(np.uint8))
    d = ImageDraw.Draw(img, "RGBA")
    x = 0
    while x < w:
        bw = rng.randint(int(w * 0.05), int(w * 0.13))
        bh = rng.randint(int(h * 0.25), int(h * 0.7))
        top = h - bh
        d.rectangle([x, top, x + bw, h], fill=(16, 16, 28, 255))
        for wy in range(top + 14, h - 10, 22):
            for wx in range(x + 8, x + bw - 8, 18):
                if rng.random() < 0.45:
                    c = rng.choice([(255, 212, 90), (255, 236, 170), (160, 200, 255)])
                    d.rectangle([wx, wy, wx + 8, wy + 11], fill=c + (rng.randint(150, 255),))
        x += bw + rng.randint(2, 14)
    for _ in range(int(w * h / 9000)):  # снег
        sx, sy, r = rng.randint(0, w), rng.randint(0, h), rng.randint(1, 4)
        d.ellipse([sx - r, sy - r, sx + r, sy + r], fill=(255, 255, 255, rng.randint(90, 220)))
    for _ in range(40):  # огни-боке
        sx, sy, r = rng.randint(0, w), rng.randint(int(h * 0.7), h), rng.randint(8, 30)
        d.ellipse([sx - r, sy - r, sx + r, sy + r], fill=(255, 200, 80, 60))
    return _finish(np.asarray(img).astype(np.float32), rng, 9)


def party_bokeh(w: int, h: int, rng: random.Random) -> Image.Image:
    base = rng.choice([(30, 20, 40), (20, 25, 50), (45, 25, 30)])
    sky = _grad(w, h, [(0, base), (1, tuple(int(c * 0.5) for c in base))])
    img = Image.fromarray(sky.astype(np.uint8))
    layer = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(layer, "RGBA")
    palette = [(255, 212, 0), (255, 255, 255), (255, 120, 80), (120, 200, 255), (255, 170, 220)]
    for _ in range(70):
        x, y, r = rng.randint(0, w), rng.randint(0, h), rng.randint(int(h * 0.02), int(h * 0.09))
        c = rng.choice(palette)
        d.ellipse([x - r, y - r, x + r, y + r], fill=c + (rng.randint(40, 110),), outline=c + (140,), width=3)
    layer = layer.filter(ImageFilter.GaussianBlur(radius=3))
    img = Image.alpha_composite(img.convert("RGBA"), layer)
    d2 = ImageDraw.Draw(img, "RGBA")
    for _ in range(260):  # конфетти
        x, y = rng.randint(0, w), rng.randint(0, h)
        s = rng.randint(6, 18)
        c = rng.choice(palette)
        ang = rng.random() * math.pi
        d2.polygon([(x, y), (x + int(s * math.cos(ang)), y + int(s * math.sin(ang))),
                    (x + int(s * math.cos(ang)) + 5, y + int(s * math.sin(ang)) + 7), (x + 5, y + 7)], fill=c + (230,))
    # «шапки выпускников» — простые силуэты
    for _ in range(rng.randint(2, 5)):
        x, y = rng.randint(int(w * 0.1), int(w * 0.9)), rng.randint(int(h * 0.1), int(h * 0.6))
        s = rng.randint(int(h * 0.04), int(h * 0.08))
        d2.polygon([(x - s, y), (x, y - s // 2), (x + s, y), (x, y + s // 2)], fill=(15, 15, 15, 255))
        d2.line([x + s // 2, y, x + s // 2, y + s], fill=(255, 212, 0, 255), width=4)
    return _finish(np.asarray(img.convert("RGB")).astype(np.float32), rng)


def garden(w: int, h: int, rng: random.Random) -> Image.Image:
    sky = _grad(w, h, [(0, (150, 200, 120)), (0.5, (70, 130, 60)), (1, (30, 70, 30))])
    img = Image.fromarray(sky.astype(np.uint8)).convert("RGBA")
    blur = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(blur, "RGBA")
    for _ in range(90):
        x, y, r = rng.randint(0, w), rng.randint(0, h), rng.randint(int(h * 0.03), int(h * 0.1))
        d.ellipse([x - r, y - r, x + r, y + r], fill=(220, 255, 180, rng.randint(20, 60)))
    img = Image.alpha_composite(img, blur.filter(ImageFilter.GaussianBlur(radius=12)))
    d2 = ImageDraw.Draw(img, "RGBA")
    for _ in range(rng.randint(5, 9)):  # цветы
        cx, cy = rng.randint(int(w * 0.1), int(w * 0.9)), rng.randint(int(h * 0.3), int(h * 0.9))
        r = rng.randint(int(h * 0.04), int(h * 0.08))
        col = rng.choice([(255, 212, 0), (255, 90, 90), (255, 255, 255), (250, 140, 200), (255, 150, 40)])
        d2.line([cx, cy, cx + rng.randint(-20, 20), h], fill=(40, 90, 30, 255), width=8)
        for k in range(8):
            a = k * math.pi / 4
            px, py = cx + int(math.cos(a) * r * 0.8), cy + int(math.sin(a) * r * 0.8)
            d2.ellipse([px - r // 2, py - r // 2, px + r // 2, py + r // 2], fill=col + (255,))
        d2.ellipse([cx - r // 3, cy - r // 3, cx + r // 3, cy + r // 3], fill=(120, 70, 20, 255))
    return _finish(np.asarray(img.convert("RGB")).astype(np.float32), rng)


SCENES = [
    ("sea", sea_sunset, "Батуми", datetime(2026, 7, 12, 19, 10, tzinfo=timezone.utc), 12),
    ("lake", lake_forest, "Нарочь", datetime(2026, 8, 3, 11, 0, tzinfo=timezone.utc), 9),
    ("grad", party_bokeh, "Минск", datetime(2026, 6, 26, 18, 0, tzinfo=timezone.utc), 8),
    ("city", city_night, "Минск", datetime(2026, 1, 4, 21, 0, tzinfo=timezone.utc), 6),
    ("garden", garden, "Дача", datetime(2026, 5, 17, 14, 0, tzinfo=timezone.utc), 6),
]


def generate(force: bool = False) -> list[dict]:
    GALLERY_DIR.mkdir(parents=True, exist_ok=True)
    index_path = GALLERY_DIR / "index.json"
    if index_path.exists() and not force:
        return json.loads(index_path.read_text(encoding="utf-8"))
    rng = random.Random(2026)
    items: list[dict] = []
    for key, fn, place, start, count in SCENES:
        for i in range(count):
            portrait = rng.random() < 0.35
            w, h = (2000, 3000) if portrait else (3000, 2000)
            flaw = None
            if key == "sea" and i == 3:
                w, h, flaw = 640, 427, "lowres"
            if key == "lake" and i == 4:
                flaw = "blur"
            if key == "city" and i == 2:
                flaw = "dark"
            if key == "garden" and i == 1:
                flaw = "blur"
            img = fn(w, h, random.Random(f"{key}{i}"))
            if flaw == "blur":
                img = img.filter(ImageFilter.GaussianBlur(radius=9))
            if flaw == "dark":
                img = Image.eval(img, lambda v: int(v * 0.28))
            name = f"{key}_{i:02d}.jpg"
            img.save(GALLERY_DIR / name, "JPEG", quality=90)
            taken = start + timedelta(hours=i * rng.uniform(1.5, 6), minutes=rng.randint(0, 50))
            items.append({"file": name, "place": place, "taken_at": taken.isoformat(), "scene": key, "flaw": flaw})
            # Почти-дубль (серийная съёмка)
            if key in ("sea", "grad") and i in (1, 5):
                dup = img.transform(img.size, Image.Transform.AFFINE, (1, 0, 6, 0, 1, 4)).filter(
                    ImageFilter.GaussianBlur(radius=0.6))
                dname = f"{key}_{i:02d}_burst.jpg"
                dup.save(GALLERY_DIR / dname, "JPEG", quality=88)
                items.append({"file": dname, "place": place, "taken_at": (taken + timedelta(seconds=2)).isoformat(),
                              "scene": key, "flaw": "duplicate"})
    index_path.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
    return items


def gallery_path(name: str) -> Path:
    p = (GALLERY_DIR / name).resolve()
    if GALLERY_DIR.resolve() not in p.parents:
        raise ValueError("bad path")
    return p
