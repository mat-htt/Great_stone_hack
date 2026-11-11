"""Встроенный движок обработки (локально, CPU). Классические алгоритмы компьютерного зрения,
настроенные под фотопечать. Работают без GPU и без внешних сервисов — гарантированный фолбэк."""
from __future__ import annotations

from typing import Any, Callable

import cv2
import numpy as np
from PIL import Image, ImageFilter

from ..imaging import analyze, from_cv, to_cv

MAX_OUT = 8000


def _limit(img: Image.Image, side: int) -> tuple[Image.Image, tuple[int, int]]:
    orig = img.size
    if max(img.size) <= side:
        return img, orig
    work = img.copy()
    work.thumbnail((side, side), Image.Resampling.LANCZOS)
    return work, orig


def _restore_size(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    return img if img.size == size else img.resize(size, Image.Resampling.LANCZOS)


def _f(img: Image.Image) -> np.ndarray:
    return np.asarray(img).astype(np.float32) / 255.0


def _img(arr: np.ndarray) -> Image.Image:
    return Image.fromarray(np.clip(arr * 255.0 + 0.5, 0, 255).astype(np.uint8))


def _unsharp(img: Image.Image, radius: float, percent: int, threshold: int = 2) -> Image.Image:
    return img.filter(ImageFilter.UnsharpMask(radius=radius, percent=percent, threshold=threshold))


def _clahe(img: Image.Image, clip: float, blend: float = 1.0) -> Image.Image:
    bgr = to_cv(img)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l2 = cv2.createCLAHE(clipLimit=clip, tileGridSize=(8, 8)).apply(l)
    if blend < 1:
        l2 = cv2.addWeighted(l2, blend, l, 1 - blend, 0)
    return from_cv(cv2.cvtColor(cv2.merge((l2, a, b)), cv2.COLOR_LAB2BGR))


def _gray_world(arr: np.ndarray, blend: float) -> np.ndarray:
    means = arr.reshape(-1, 3).mean(axis=0) + 1e-6
    scale = means.mean() / means
    scale = 1 + (scale - 1) * blend
    return arr * scale


def _levels(arr: np.ndarray, lo_p: float = 0.4, hi_p: float = 99.6) -> np.ndarray:
    lum = arr.mean(axis=2)
    lo, hi = np.percentile(lum, lo_p), np.percentile(lum, hi_p)
    if hi - lo < 0.15:
        return arr
    return (arr - lo) / (hi - lo)


def _vibrance(img: Image.Image, amount: float) -> Image.Image:
    hsv = cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2HSV).astype(np.float32)
    s = hsv[..., 1] / 255.0
    s = s + amount * (1 - s) * s * 1.6
    hsv[..., 1] = np.clip(s, 0, 1) * 255
    return Image.fromarray(cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB))


def _temperature(arr: np.ndarray, t: float) -> np.ndarray:
    # t в диапазоне [-1, 1]: + теплее, − холоднее
    out = arr.copy()
    out[..., 0] *= 1 + 0.10 * t
    out[..., 2] *= 1 - 0.10 * t
    out[..., 1] *= 1 + 0.02 * t
    return out


def auto_enhance(img: Image.Image, strength: float = 1.0, **_: Any) -> Image.Image:
    work, size = _limit(img, 5000)
    arr = _f(work)
    arr = _gray_world(arr, 0.55 * strength)
    arr = _levels(arr)
    # мягкая S-кривая
    arr = np.clip(arr, 0, 1)
    arr = arr + 0.35 * strength * (arr - arr ** 2) * (2 * arr - 1)
    out = _img(np.clip(arr, 0, 1))
    out = _clahe(out, 1.6, blend=0.55 * strength)
    out = _vibrance(out, 0.18 * strength)
    out = _unsharp(out, 1.1, int(55 * strength), 3)
    return _restore_size(out, size)


def upscale(img: Image.Image, scale: int = 2, **_: Any) -> Image.Image:
    scale = 4 if int(scale) >= 4 else 2
    w, h = img.size
    factor = min(scale, MAX_OUT / max(w, h))
    if factor <= 1.01:
        return _unsharp(img, 1.0, 40)
    bgr = to_cv(img)
    bgr = cv2.bilateralFilter(bgr, 5, 18, 5)
    step = bgr
    remaining = factor
    while remaining > 1.01:  # пошаговое увеличение даёт меньше артефактов
        f = min(2.0, remaining)
        step = cv2.resize(step, None, fx=f, fy=f, interpolation=cv2.INTER_LANCZOS4)
        blur = cv2.GaussianBlur(step, (0, 0), 1.2)
        step = cv2.addWeighted(step, 1.45, blur, -0.45, 0)
        remaining /= f
    return from_cv(step)


def text_clarity(img: Image.Image, **_: Any) -> Image.Image:
    work, size = _limit(img, 4200)
    bgr = to_cv(work)
    bgr = cv2.fastNlMeansDenoisingColored(cv2.resize(bgr, None, fx=1, fy=1), None, 3, 3, 5, 15) \
        if max(work.size) <= 2600 else cv2.bilateralFilter(bgr, 5, 20, 5)
    out = from_cv(bgr)
    out = _clahe(out, 2.2, blend=0.7)
    out = _unsharp(out, 1.6, 140, 2)
    out = _unsharp(out, 0.6, 60, 1)
    return _restore_size(out, size)


def denoise(img: Image.Image, strength: float = 1.0, **_: Any) -> Image.Image:
    work, size = _limit(img, 2400)
    h = int(7 * strength)
    bgr = cv2.fastNlMeansDenoisingColored(to_cv(work), None, h, h, 7, 21)
    out = _unsharp(from_cv(bgr), 0.9, 35, 2)
    return _restore_size(out, size)


def _skin_mask(bgr: np.ndarray) -> np.ndarray:
    ycrcb = cv2.cvtColor(bgr, cv2.COLOR_BGR2YCrCb)
    mask = cv2.inRange(ycrcb, (0, 135, 85), (255, 180, 135))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    return cv2.GaussianBlur(mask, (0, 0), 6).astype(np.float32) / 255.0


def portrait(img: Image.Image, **_: Any) -> Image.Image:
    work, size = _limit(img, 3600)
    bgr = to_cv(work)
    h, w = bgr.shape[:2]
    faces = analyze(work)["faces"]
    mask = np.zeros((h, w), np.float32)
    if faces:
        for f in faces:
            cx, cy = int((f["x"] + f["w"] / 2) * w), int((f["y"] + f["h"] / 2) * h)
            ax, ay = int(f["w"] * w * 0.75), int(f["h"] * h * 0.95)
            cv2.ellipse(mask, (cx, cy), (ax, ay), 0, 0, 360, 1.0, -1)
        mask = cv2.GaussianBlur(mask, (0, 0), max(8, w / 120)) * np.clip(_skin_mask(bgr) * 1.6, 0.35, 1)
    else:
        mask = _skin_mask(bgr) * 0.8
    smooth = cv2.bilateralFilter(bgr, 0, 38, 9)
    smooth = cv2.bilateralFilter(smooth, 0, 28, 6)
    m = mask[..., None] * 0.72
    out = bgr.astype(np.float32) * (1 - m) + smooth.astype(np.float32) * m
    out = np.clip(out * (1 + 0.04 * mask[..., None]), 0, 255).astype(np.uint8)
    res = from_cv(out)
    arr = _temperature(_f(res), 0.18)
    res = _vibrance(_img(np.clip(arr, 0, 1)), 0.06)
    return _restore_size(res, size)


def restore(img: Image.Image, **_: Any) -> Image.Image:
    work, size = _limit(img, 3000)
    bgr = to_cv(work)
    bgr = cv2.medianBlur(bgr, 3)
    bgr = cv2.fastNlMeansDenoisingColored(bgr, None, 9, 9, 7, 21)
    arr = _f(from_cv(bgr))
    arr = _gray_world(arr, 0.9)
    arr = _levels(arr, 1.0, 99.0)
    out = _img(np.clip(arr, 0, 1))
    out = _clahe(out, 2.4, 0.85)
    out = _vibrance(out, 0.25)
    out = _unsharp(out, 1.4, 90, 3)
    return _restore_size(out, size)


def _vignette(arr: np.ndarray, amount: float) -> np.ndarray:
    h, w = arr.shape[:2]
    y, x = np.ogrid[:h, :w]
    d = np.sqrt(((x - w / 2) / (w / 2)) ** 2 + ((y - h / 2) / (h / 2)) ** 2)
    return arr * (1 - amount * np.clip(d - 0.45, 0, 1)[..., None])


def _grain(arr: np.ndarray, amount: float, seed: int = 7) -> np.ndarray:
    rng = np.random.default_rng(seed)
    noise = rng.normal(0, amount, arr.shape[:2]).astype(np.float32)[..., None]
    return arr + noise


def style(img: Image.Image, style: str = "film", **_: Any) -> Image.Image:
    work, size = _limit(img, 5000)
    arr = _f(work)
    if style == "warm":
        arr = _temperature(arr, 0.7)
        arr = arr * 1.02 + 0.01
    elif style == "cool":
        arr = _temperature(arr, -0.7)
    elif style == "bw":
        lum = arr @ np.array([0.30, 0.59, 0.11], np.float32)
        lum = np.clip((lum - 0.5) * 1.15 + 0.5, 0, 1)
        arr = np.repeat(lum[..., None], 3, axis=2)
        arr = _grain(arr, 0.018)
    elif style == "vintage":
        sep = arr @ np.array([[0.393, 0.349, 0.272], [0.769, 0.686, 0.534], [0.189, 0.168, 0.131]], np.float32)
        arr = arr * 0.45 + sep * 0.55
        arr = arr * 0.9 + 0.06
        arr = _vignette(arr, 0.45)
        arr = _grain(arr, 0.02)
    elif style == "vivid":
        out = _vibrance(_clahe(work, 2.0, 0.7), 0.35)
        return _restore_size(out, size)
    elif style == "soft":
        glow = np.asarray(work.filter(ImageFilter.GaussianBlur(radius=max(4, work.width / 160)))).astype(np.float32) / 255
        arr = 1 - (1 - arr) * (1 - glow * 0.35)
        arr = arr * 0.97 + 0.02
    else:  # film
        arr = _temperature(arr, 0.25)
        arr = arr * 0.92 + 0.045  # приподнятые тени
        arr[..., 2] = arr[..., 2] * 0.95 + 0.03
        arr = _vignette(arr, 0.25)
        arr = _grain(arr, 0.014)
    return _restore_size(_img(np.clip(arr, 0, 1)), size)


def smart_extend(img: Image.Image, aspect: float = 1.0, **_: Any) -> Image.Image:
    aspect = float(aspect or 1.0)
    w, h = img.size
    if abs(w / h - aspect) < 0.01:
        return img
    if w / h > aspect:
        tw, th = w, int(w / aspect)
    else:
        tw, th = int(h * aspect), h
    bg = img.resize((tw, th), Image.Resampling.BILINEAR)
    small = bg.copy()
    small.thumbnail((256, 256))
    bg = small.filter(ImageFilter.GaussianBlur(radius=14)).resize((tw, th), Image.Resampling.BICUBIC)
    arr = _f(bg) * 0.86 + 0.04
    bg = _img(np.clip(arr, 0, 1))
    bg.paste(img, ((tw - w) // 2, (th - h) // 2))
    return bg


def remove_bg(img: Image.Image, **_: Any) -> Image.Image:
    work, size = _limit(img, 900)
    bgr = to_cv(work)
    h, w = bgr.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    rect = (int(w * 0.05), int(h * 0.04), int(w * 0.9), int(h * 0.94))
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(bgr, mask, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)
    fg = np.where((mask == 1) | (mask == 3), 1.0, 0.0).astype(np.float32)
    fg = cv2.GaussianBlur(fg, (0, 0), 1.6)
    fg_full = cv2.resize(fg, size, interpolation=cv2.INTER_LINEAR)[..., None]
    arr = _f(img)
    out = arr * fg_full + (1 - fg_full) * 1.0
    return _img(out)


def adjust(img: Image.Image, brightness: float = 0, contrast: float = 0, saturation: float = 0,
           temperature: float = 0, rotate: int = 0, **_: Any) -> Image.Image:
    """Ручная коррекция: значения −100…100, поворот кратен 90."""
    out = img
    if rotate:
        out = out.rotate(-int(rotate), expand=True)
    arr = _f(out)
    if temperature:
        arr = _temperature(arr, float(temperature) / 100)
    if brightness:
        arr = arr + float(brightness) / 250
    if contrast:
        c = 1 + float(contrast) / 120
        arr = (arr - 0.5) * c + 0.5
    out = _img(np.clip(arr, 0, 1))
    if saturation:
        hsv = cv2.cvtColor(np.asarray(out), cv2.COLOR_RGB2HSV).astype(np.float32)
        hsv[..., 1] = np.clip(hsv[..., 1] * (1 + float(saturation) / 100), 0, 255)
        out = Image.fromarray(cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB))
    return out


IMAGE_OPS: dict[str, Callable[..., Image.Image]] = {
    "auto_enhance": auto_enhance, "upscale": upscale, "text_clarity": text_clarity, "denoise": denoise,
    "portrait": portrait, "restore": restore, "style": style, "smart_extend": smart_extend,
    "remove_bg": remove_bg, "adjust": adjust,
}
