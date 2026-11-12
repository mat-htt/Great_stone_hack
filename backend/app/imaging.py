"""Загрузка, нормализация и анализ фотографий: резкость, экспозиция, лица, перцептивный хеш."""
from __future__ import annotations

import io
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np
from PIL import Image, ImageOps

from .config import MEDIA_DIR

Image.MAX_IMAGE_PIXELS = 120_000_000
MAX_SIDE = 6000
THUMB_SIDE = 720

_CASCADE_PATH = str(Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml")


def _faces_detector():
    # Детектор создаётся на вызов и уничтожается в том же потоке: глобальный объект,
    # использованный из рабочего потока, на Windows блокирует завершение процесса.
    return cv2.CascadeClassifier(_CASCADE_PATH)


def open_image(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")
    return img


def exif_taken_at(data: bytes) -> Optional[datetime]:
    try:
        exif = Image.open(io.BytesIO(data)).getexif()
        raw = exif.get_ifd(0x8769).get(36867) or exif.get(306)
        if raw:
            return datetime.strptime(str(raw), "%Y:%m:%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except Exception:
        pass
    return None


def to_cv(img: Image.Image) -> np.ndarray:
    return cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2BGR)


def from_cv(arr: np.ndarray) -> Image.Image:
    return Image.fromarray(cv2.cvtColor(arr, cv2.COLOR_BGR2RGB))


def dhash(img: Image.Image) -> str:
    small = img.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    px = np.asarray(small, dtype=np.int16)
    bits = (px[:, 1:] > px[:, :-1]).flatten()
    value = 0
    for b in bits:
        value = (value << 1) | int(b)
    return f"{value:016x}"


def hamming(a: str, b: str) -> int:
    if not a or not b:
        return 64
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def analyze(img: Image.Image) -> dict[str, Any]:
    work = img.copy()
    work.thumbnail((900, 900))
    gray = cv2.cvtColor(np.asarray(work), cv2.COLOR_RGB2GRAY)
    sharp = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    bright = float(gray.mean())
    faces_out: list[dict[str, float]] = []
    try:
        from .ai.neural import detect_faces
        neural_faces = detect_faces(np.asarray(work))
    except Exception:
        neural_faces = None
    if neural_faces is not None:
        return {"sharpness": round(sharp, 1), "brightness": round(bright, 1), "faces": neural_faces,
                "phash": dhash(img), "face_model": "YuNet"}
    try:
        det = _faces_detector()
        found = det.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=6, minSize=(36, 36))
        h, w = gray.shape
        for (x, y, fw, fh) in list(found)[:8]:
            faces_out.append({"x": x / w, "y": y / h, "w": fw / w, "h": fh / h})
    except Exception:
        pass
    return {"sharpness": round(sharp, 1), "brightness": round(bright, 1), "faces": faces_out, "phash": dhash(img),
            "face_model": "Haar"}


def sharpness_norm(sharp: float) -> float:
    # ~25 и ниже — заметно размыто, 180+ — резко (для превью 900px)
    return float(max(0.0, min(1.0, (sharp - 25) / 155)))


def quality_score(width: int, height: int, sharp: float, bright: float, faces: list) -> float:
    s = sharpness_norm(sharp)
    exposure = 1.0 - min(1.0, abs(bright - 128) / 110)
    res = min(1.0, (width * height) / (4000 * 3000))
    face_bonus = 1.0 if faces else 0.35
    return round(0.45 * s + 0.2 * exposure + 0.2 * face_bonus + 0.15 * res, 3)


def save_image(img: Image.Image, owner_id: int, photo_id: str) -> tuple[str, str, int]:
    if max(img.size) > MAX_SIDE:
        img = img.copy()
        img.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
    folder = MEDIA_DIR / str(owner_id)
    folder.mkdir(parents=True, exist_ok=True)
    rel = f"{owner_id}/{photo_id}.jpg"
    rel_thumb = f"{owner_id}/{photo_id}_t.jpg"
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=94, optimize=True)
    (MEDIA_DIR / rel).write_bytes(buf.getvalue())
    th = img.copy()
    th.thumbnail((THUMB_SIDE, THUMB_SIDE), Image.Resampling.LANCZOS)
    th.save(MEDIA_DIR / rel_thumb, "JPEG", quality=84, optimize=True)
    return rel, rel_thumb, len(buf.getvalue())


def load_media(rel: str) -> Image.Image:
    return Image.open(MEDIA_DIR / rel).convert("RGB")


def delete_media(*rels: str) -> None:
    for rel in rels:
        try:
            (MEDIA_DIR / rel).unlink(missing_ok=True)
        except Exception:
            pass
