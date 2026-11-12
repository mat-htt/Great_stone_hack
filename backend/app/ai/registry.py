"""Реестр AI-инструментов и провайдеров.

Каждый инструмент можно переключить на любой совместимый провайдер в админке:
  builtin     — встроенные алгоритмы (OpenCV/NumPy), работают локально без GPU и без интернета;
  openai      — любой OpenAI-совместимый API: OpenAI, OpenRouter, vLLM, Ollama (Qwen3 / Qwen2.5-VL), LM Studio;
  http_image  — собственный GPU-воркер по простому контракту (Real-ESRGAN, GFPGAN, rembg, SDXL…).
"""
from __future__ import annotations

from typing import Any

from ..config import LOCAL_LLM_MODEL, OLLAMA_URL

IMAGE = "image"
LLM_DEFAULT = {"command", "captions", "support_reply"}  # по умолчанию идут в локальную Qwen3
TEXT = "text"

TOOLS: dict[str, dict[str, Any]] = {
    "auto_enhance": {
        "title": "Магия", "subtitle": "Свет, цвет и контраст как после ретушёра", "type": IMAGE,
        "group": "Улучшить", "icon": "wand", "kinds": ["builtin", "http_image", "openai"],
        "prompt": "Professionally retouch this photo for print: balanced exposure, natural colors, "
                  "gentle local contrast. Keep it realistic, do not change content.",
    },
    "upscale": {
        "title": "Увеличить ×2/×4", "subtitle": "Больше пикселей для крупной печати", "type": IMAGE,
        "group": "Улучшить", "icon": "expand", "kinds": ["builtin", "http_image"],
        "params": {"scale": {"type": "choice", "values": [2, 4], "default": 2}},
    },
    "text_clarity": {
        "title": "Чёткость", "subtitle": "Резкость деталей и читаемость текста на фото", "type": IMAGE,
        "group": "Улучшить", "icon": "focus", "kinds": ["builtin", "http_image"],
    },
    "denoise": {
        "title": "Без шума", "subtitle": "Убирает цифровой шум ночных снимков", "type": IMAGE,
        "group": "Улучшить", "icon": "drop", "kinds": ["builtin", "http_image"],
    },
    "portrait": {
        "title": "Портрет", "subtitle": "Мягкая ретушь кожи по найденным лицам", "type": IMAGE,
        "group": "Ретушь", "icon": "face", "kinds": ["builtin", "http_image", "openai"],
        "prompt": "Subtle natural portrait retouch: even skin tone, reduce blemishes, brighten eyes slightly. "
                  "Keep identity and realism.",
    },
    "restore": {
        "title": "Реставрация", "subtitle": "Старые и выцветшие фото: цвет, шум, царапины", "type": IMAGE,
        "group": "Ретушь", "icon": "history", "kinds": ["builtin", "http_image", "openai"],
        "prompt": "Restore this old photo: remove scratches and noise, fix faded colors, keep it authentic.",
    },
    "remove_bg": {
        "title": "Убрать фон", "subtitle": "Объект на чистом фоне — для магнитов и холстов", "type": IMAGE,
        "group": "Ретушь", "icon": "scissors", "kinds": ["builtin", "http_image", "openai"],
        "prompt": "Remove the background and place the main subject on a clean white background.",
    },
    "style": {
        "title": "Стиль", "subtitle": "Плёнка, тёплый, ч/б, винтаж…", "type": IMAGE,
        "group": "Стиль", "icon": "palette", "kinds": ["builtin", "http_image"],
        "params": {"style": {"type": "choice", "values": ["film", "warm", "cool", "bw", "vintage", "vivid", "soft"],
                             "default": "film"}},
    },
    "smart_extend": {
        "title": "Расширить кадр", "subtitle": "Подогнать фото под формат без обрезки лиц", "type": IMAGE,
        "group": "Стиль", "icon": "frame", "kinds": ["builtin", "http_image", "openai"],
        "params": {"aspect": {"type": "number", "default": 1.0}},
        "prompt": "Extend (outpaint) this photo to fill the new canvas naturally, matching the scene.",
    },
    "adjust": {
        "title": "Ручная коррекция", "subtitle": "Яркость, контраст, насыщенность, температура, поворот",
        "type": IMAGE, "group": "Ручное", "icon": "sliders", "kinds": ["builtin"], "manual": True,
    },
    "scene_magic": {
        "title": "Я в сцене", "subtitle": "Генеративная обложка: «я на море», «в лимузине»", "type": IMAGE,
        "group": "Генерация", "icon": "stars", "kinds": ["openai", "http_image"], "generative": True,
        "params": {"scene": {"type": "text", "default": "на берегу тёплого моря на закате"}},
        "prompt": "Place the people from this photo {scene}. Photorealistic, keep faces and identity unchanged, "
                  "cinematic light, high detail, suitable for a photobook cover.",
    },
    # Текстовые/интеллектуальные задачи
    "curate": {"title": "Кот-куратор", "subtitle": "Отбирает лучшие кадры, убирает дубли и брак",
               "type": TEXT, "group": "Режиссёр", "icon": "cat", "kinds": ["builtin"]},
    "layout": {"title": "Автомакет", "subtitle": "Раскладывает фото по разворотам", "type": TEXT,
               "group": "Режиссёр", "icon": "layout", "kinds": ["builtin"]},
    "captions": {"title": "Подписи и название", "subtitle": "Тёплые подписи к разворотам", "type": TEXT,
                 "group": "Режиссёр", "icon": "quote", "kinds": ["builtin", "openai"]},
    "command": {"title": "Кот-ассистент", "subtitle": "Правки словами: «сделай теплее, убери 5-ю страницу»",
                "type": TEXT, "group": "Режиссёр", "icon": "chat", "kinds": ["builtin", "openai"]},
    "support_reply": {"title": "Черновик ответа поддержки", "subtitle": "Оператор подтверждает перед отправкой",
                      "type": TEXT, "group": "Операции", "icon": "headset", "kinds": ["builtin", "openai"]},
    "preflight": {"title": "Робот-ОТК", "subtitle": "Предпечатная проверка: dpi, размытие, пустые места",
                  "type": TEXT, "group": "Режиссёр", "icon": "robot", "kinds": ["builtin"]},
}

PROVIDER_PRESETS: list[dict[str, Any]] = [
    {"id": "builtin", "title": "Встроенный движок picPac", "kind": "builtin",
     "location": "Сервер picPac, данные не покидают контур",
     "notes": "Нейросети на CPU: YuNet (лица), FSRCNN (увеличение), U²-Net (фон) + OpenCV"},
    {"id": "ollama", "title": "Qwen3 · свой сервер (Ollama)", "kind": "openai",
     "base_url": OLLAMA_URL, "default_model": LOCAL_LLM_MODEL, "vision_model": "qwen2.5vl:3b",
     "location": "Собственный сервер компании", "enabled": True,
     "notes": "Поднимается в docker compose рядом с приложением; работает на CPU"},
    {"id": "vllm", "title": "vLLM · Qwen3 (GPU-кластер)", "kind": "openai",
     "base_url": "http://vllm:8000/v1", "default_model": "Qwen/Qwen3-14B", "vision_model": "Qwen/Qwen2.5-VL-7B-Instruct",
     "location": "Собственный GPU-сервер", "enabled": False},
    {"id": "openrouter", "title": "OpenRouter (облако)", "kind": "openai",
     "base_url": "https://openrouter.ai/api/v1", "api_key_env": "OPENROUTER_API_KEY",
     "default_model": "qwen/qwen3-32b", "vision_model": "qwen/qwen2.5-vl-72b-instruct",
     "location": "Облако провайдера (вне РБ)", "enabled": False},
    {"id": "openai", "title": "OpenAI (облако)", "kind": "openai", "base_url": "https://api.openai.com/v1",
     "api_key_env": "OPENAI_API_KEY", "default_model": "gpt-4.1-mini", "image_model": "gpt-image-1",
     "location": "Облако провайдера (вне РБ)", "enabled": False},
    {"id": "gpu_worker", "title": "GPU-воркер picPac (Real-ESRGAN, GFPGAN, rembg)", "kind": "http_image",
     "base_url": "http://ai-worker:9000", "location": "Собственный GPU-сервер", "enabled": False,
     "notes": "Контракт: POST /v1/tools/{tool} (multipart image + params) → image/jpeg"},
]


def tool_public(tool_id: str) -> dict[str, Any]:
    t = TOOLS[tool_id]
    return {"id": tool_id, **{k: v for k, v in t.items() if k != "prompt"}}
