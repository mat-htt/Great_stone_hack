"""Скачивает открытые нейросетевые модели для встроенного AI-движка (CPU, ONNX/TensorFlow).

  YuNet (OpenCV Zoo, MIT)            — детектор лиц с ключевыми точками        ~0.2 МБ
  FSRCNN x2/x4 (Saafke, MIT)         — нейросетевое увеличение разрешения        ~0.04 МБ
  U²-Net-p (xuebinqin/rembg, Apache) — сегментация объекта / удаление фона     ~4.6 МБ

Запуск: python scripts/download_models.py [папка]
"""
from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

MODELS = {
    "face_detection_yunet_2023mar.onnx":
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "FSRCNN_x2.pb": "https://raw.githubusercontent.com/Saafke/FSRCNN_Tensorflow/master/models/FSRCNN_x2.pb",
    "FSRCNN_x4.pb": "https://raw.githubusercontent.com/Saafke/FSRCNN_Tensorflow/master/models/FSRCNN_x4.pb",
    "u2netp.onnx": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx",
}


def main(target: str) -> None:
    out = Path(target)
    out.mkdir(parents=True, exist_ok=True)
    for name, url in MODELS.items():
        path = out / name
        if path.exists() and path.stat().st_size > 1000:
            print(f"ok   {name}")
            continue
        for attempt in range(4):
            try:
                urllib.request.urlretrieve(url, path)
                print(f"got  {name} ({path.stat().st_size // 1024} KB)")
                break
            except Exception as e:  # pragma: no cover
                print(f"retry {name}: {e}")
        else:
            print(f"FAIL {name} — встроенный движок использует классический фолбэк")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parents[1] / "models"))
