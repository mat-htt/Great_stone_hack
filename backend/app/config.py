"""Конфигурация приложения. Все секреты — только из переменных окружения."""
from __future__ import annotations

import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", str(BASE_DIR / "data")))
MEDIA_DIR = DATA_DIR / "media"
DATA_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

CONFIG_DATA = Path(__file__).resolve().parent / "config_data"
MODELS_DIR = Path(os.getenv("MODELS_DIR", str(BASE_DIR / "models")))
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434/v1")
LOCAL_LLM_MODEL = os.getenv("LOCAL_LLM_MODEL", "qwen2.5:1.5b")

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{(DATA_DIR / 'picpac.db').as_posix()}")


def _jwt_secret() -> str:
    env = os.getenv("JWT_SECRET")
    if env:
        return env
    # Секрет генерируется при первом запуске и хранится рядом с данными (не в репозитории).
    path = DATA_DIR / ".jwt_secret"
    if path.exists():
        return path.read_text().strip()
    value = secrets.token_urlsafe(48)
    path.write_text(value)
    return value


JWT_SECRET = _jwt_secret()
JWT_TTL_HOURS = int(os.getenv("JWT_TTL_HOURS", "72"))
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

TIMEZONE = "Europe/Minsk"
CURRENCY = "BYN"

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "25"))
MIN_PHOTO_SIDE = 400          # меньше — отклоняем загрузку
RECOMMENDED_DPI = 250         # норма печати
WARNING_DPI = 180             # ниже — предупреждение
CRITICAL_DPI = 110            # ниже — критично
SEED_ON_START = os.getenv("SEED_ON_START", "1") == "1"
DEMO_SIMULATOR = os.getenv("DEMO_SIMULATOR", "1") == "1"

# Сколько минут ручной работы ретушёра заменяет одна AI-операция (для метрики экономии).
MANUAL_MINUTES = {
    "auto_enhance": 4, "upscale": 6, "text_clarity": 5, "denoise": 4, "portrait": 9,
    "restore": 15, "style": 2, "smart_extend": 8, "remove_bg": 10, "scene_magic": 25,
    "curate": 30, "layout": 40, "captions": 10, "command": 3,
}
RETOUCHER_RATE_BYN_HOUR = float(os.getenv("RETOUCHER_RATE_BYN_HOUR", "18"))
