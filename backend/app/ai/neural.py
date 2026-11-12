"""Нейросетевые модели встроенного движка (CPU, без интернета).

  YuNet      — детектор лиц (OpenCV Zoo). Лица используются для умного кадрирования, ретуши
               и проверки «лицо обрезано».
  FSRCNN     — нейросетевое увеличение разрешения ×2/×4 (OpenCV dnn_superres).
  U²-Net-p   — сегментация главного объекта для удаления фона (onnxruntime).

Если файла модели нет или модуль недоступен — функции возвращают None, и движок
использует классический алгоритм. Это гарантирует, что сервис работает всегда."""
from __future__ import annotations

import threading
from functools import lru_cache
from typing import Any, Optional

import cv2
import numpy as np
from PIL import Image

from ..config import MODELS_DIR

YUNET = MODELS_DIR / "face_detection_yunet_2023mar.onnx"
U2NETP = MODELS_DIR / "u2netp.onnx"
_lock = threading.Lock()


def status() -> dict[str, Any]:
    return {
        "yunet": YUNET.exists() and hasattr(cv2, "FaceDetectorYN"),
        "fsrcnn_x2": (MODELS_DIR / "FSRCNN_x2.pb").exists() and hasattr(cv2, "dnn_superres"),
        "fsrcnn_x4": (MODELS_DIR / "FSRCNN_x4.pb").exists() and hasattr(cv2, "dnn_superres"),
        "u2netp": U2NETP.exists() and _onnx_available(),
    }


def _onnx_available() -> bool:
    try:
        import onnxruntime  # noqa: F401
        return True
    except Exception:
        return False


def detect_faces(rgb: np.ndarray) -> Optional[list[dict[str, float]]]:
    """Возвращает лица в долях кадра или None, если модель недоступна."""
    if not status()["yunet"]:
        return None
    h, w = rgb.shape[:2]
    scale = min(1.0, 960 / max(h, w))
    small = cv2.resize(rgb, (int(w * scale), int(h * scale))) if scale < 1 else rgb
    bgr = cv2.cvtColor(small, cv2.COLOR_RGB2BGR)
    sh, sw = bgr.shape[:2]
    det = cv2.FaceDetectorYN.create(str(YUNET), "", (sw, sh), 0.75, 0.3, 50)
    _, faces = det.detect(bgr)
    out: list[dict[str, float]] = []
    if faces is not None:
        for f in faces[:12]:
            x, y, fw, fh, score = float(f[0]), float(f[1]), float(f[2]), float(f[3]), float(f[14])
            out.append({"x": max(0.0, x / sw), "y": max(0.0, y / sh), "w": fw / sw, "h": fh / sh,
                        "score": round(score, 2),
                        "eyes": [[float(f[4]) / sw, float(f[5]) / sh], [float(f[6]) / sw, float(f[7]) / sh]]})
    return out


def super_resolve(img: Image.Image, scale: int) -> Optional[Image.Image]:
    name = f"FSRCNN_x{scale}.pb"
    if not status().get(f"fsrcnn_x{scale}"):
        return None
    sr = cv2.dnn_superres.DnnSuperResImpl_create()
    sr.readModel(str(MODELS_DIR / name))
    sr.setModel("fsrcnn", scale)
    bgr = cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2BGR)
    # FSRCNN работает по яркости; режем на тайлы, чтобы не упираться в память
    tile = 700
    h, w = bgr.shape[:2]
    out = np.zeros((h * scale, w * scale, 3), np.uint8)
    for y in range(0, h, tile):
        for x in range(0, w, tile):
            part = bgr[y:y + tile, x:x + tile]
            up = sr.upsample(part)
            out[y * scale:y * scale + up.shape[0], x * scale:x * scale + up.shape[1]] = up
    return Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB))


@lru_cache(maxsize=1)
def _u2net_session():
    import onnxruntime as ort
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 4
    return ort.InferenceSession(str(U2NETP), opts, providers=["CPUExecutionProvider"])


def salient_mask(img: Image.Image) -> Optional[np.ndarray]:
    """Маска главного объекта 0..1 размера исходного изображения (U²-Net-p)."""
    if not status()["u2netp"]:
        return None
    with _lock:
        sess = _u2net_session()
        small = img.convert("RGB").resize((320, 320), Image.Resampling.BILINEAR)
        x = np.asarray(small).astype(np.float32) / 255.0
        x = (x - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
        x = x.transpose(2, 0, 1)[None]
        pred = sess.run(None, {sess.get_inputs()[0].name: x})[0][0, 0]
    pred = (pred - pred.min()) / max(1e-6, pred.max() - pred.min())
    mask = cv2.resize(pred, img.size, interpolation=cv2.INTER_LINEAR)
    return np.clip(mask, 0, 1).astype(np.float32)
