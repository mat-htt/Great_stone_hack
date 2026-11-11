"""Клиенты внешних провайдеров. Ключи берутся из БД (вводятся в админке) или переменных окружения."""
from __future__ import annotations

import base64
import io
import json
import os
import re
from typing import Any, Optional

import httpx
from PIL import Image

from ..models import AIProvider

TIMEOUT = httpx.Timeout(90.0, connect=6.0)


class ProviderError(Exception):
    pass


def api_key(p: AIProvider) -> str:
    return p.api_key or (os.getenv(p.api_key_env) if p.api_key_env else "") or ""


def _headers(p: AIProvider) -> dict[str, str]:
    key = api_key(p)
    h = {"User-Agent": "picpac-ai-gateway/1.0"}
    if key:
        h["Authorization"] = f"Bearer {key}"
    return h


def _jpeg(img: Image.Image, fmt: str = "JPEG") -> bytes:
    buf = io.BytesIO()
    img.save(buf, fmt, quality=92) if fmt == "JPEG" else img.save(buf, fmt)
    return buf.getvalue()


def strip_think(text: str) -> str:
    # Qwen3 и др. reasoning-модели могут возвращать блок <think>…</think>
    return re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()


def extract_json(text: str) -> Any:
    text = strip_think(text)
    m = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.S)
    if m:
        text = m.group(1)
    start = min([i for i in (text.find("{"), text.find("[")) if i >= 0], default=-1)
    if start < 0:
        raise ProviderError("Модель вернула ответ не в JSON")
    return json.loads(text[start:])


def chat(p: AIProvider, model: str, messages: list[dict[str, Any]], temperature: float = 0.3,
         max_tokens: int = 900) -> str:
    if not p.base_url:
        raise ProviderError("У провайдера не указан base_url")
    url = p.base_url.rstrip("/") + "/chat/completions"
    body = {"model": model or p.default_model, "messages": messages, "temperature": temperature,
            "max_tokens": max_tokens}
    try:
        r = httpx.post(url, json=body, headers=_headers(p), timeout=TIMEOUT)
    except httpx.HTTPError as e:
        raise ProviderError(f"Нет связи с провайдером: {e.__class__.__name__}") from e
    if r.status_code >= 400:
        raise ProviderError(f"Провайдер ответил {r.status_code}: {r.text[:160]}")
    try:
        return r.json()["choices"][0]["message"]["content"] or ""
    except Exception as e:
        raise ProviderError("Неожиданный формат ответа провайдера") from e


def image_edit(p: AIProvider, model: str, img: Image.Image, prompt: str) -> Image.Image:
    """OpenAI-совместимый /images/edits (gpt-image-1, совместимые self-hosted шлюзы)."""
    url = p.base_url.rstrip("/") + "/images/edits"
    work = img.copy()
    work.thumbnail((1536, 1536))
    files = {"image": ("image.png", _jpeg(work, "PNG"), "image/png")}
    data = {"model": model or p.image_model or "gpt-image-1", "prompt": prompt, "n": "1"}
    try:
        r = httpx.post(url, data=data, files=files, headers=_headers(p), timeout=httpx.Timeout(180.0, connect=6.0))
    except httpx.HTTPError as e:
        raise ProviderError(f"Нет связи с провайдером: {e.__class__.__name__}") from e
    if r.status_code >= 400:
        raise ProviderError(f"Провайдер ответил {r.status_code}: {r.text[:160]}")
    item = r.json()["data"][0]
    if item.get("b64_json"):
        raw = base64.b64decode(item["b64_json"])
    else:
        raw = httpx.get(item["url"], timeout=TIMEOUT).content
    return Image.open(io.BytesIO(raw)).convert("RGB")


def http_image(p: AIProvider, tool_id: str, model: str, img: Image.Image, params: dict[str, Any]) -> Image.Image:
    """Контракт собственного GPU-воркера: POST {base}/v1/tools/{tool} → image/jpeg."""
    url = p.base_url.rstrip("/") + f"/v1/tools/{tool_id}"
    files = {"image": ("image.jpg", _jpeg(img), "image/jpeg")}
    data = {"params": json.dumps(params), "model": model or p.default_model}
    try:
        r = httpx.post(url, data=data, files=files, headers=_headers(p), timeout=httpx.Timeout(180.0, connect=6.0))
    except httpx.HTTPError as e:
        raise ProviderError(f"GPU-воркер недоступен: {e.__class__.__name__}") from e
    if r.status_code >= 400:
        raise ProviderError(f"GPU-воркер ответил {r.status_code}: {r.text[:160]}")
    return Image.open(io.BytesIO(r.content)).convert("RGB")


def ping(p: AIProvider) -> dict[str, Any]:
    if p.kind == "builtin":
        return {"ok": True, "message": "Встроенный движок доступен", "models": ["picpac-cv-1"]}
    try:
        if p.kind == "openai":
            r = httpx.get(p.base_url.rstrip("/") + "/models", headers=_headers(p), timeout=httpx.Timeout(8.0))
            if r.status_code >= 400:
                return {"ok": False, "message": f"Ответ {r.status_code}: {r.text[:120]}"}
            models = [m.get("id") for m in r.json().get("data", [])][:30]
            return {"ok": True, "message": f"Доступно моделей: {len(models)}", "models": models}
        r = httpx.get(p.base_url.rstrip("/") + "/health", headers=_headers(p), timeout=httpx.Timeout(8.0))
        return {"ok": r.status_code < 400, "message": f"Ответ {r.status_code}", "models": []}
    except httpx.HTTPError as e:
        return {"ok": False, "message": f"Нет связи: {e.__class__.__name__}"}


def masked(key: Optional[str]) -> str:
    if not key:
        return ""
    return key[:4] + "…" + key[-4:] if len(key) > 10 else "••••"
