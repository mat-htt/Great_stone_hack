"""AI-шлюз: выбирает провайдера по настройке инструмента, выполняет задачу, при сбое
откатывается на встроенный движок и пишет каждую операцию в журнал AI-задач."""
from __future__ import annotations

import json
import time
from typing import Any, Optional

from PIL import Image
from sqlalchemy.orm import Session

from ..config import MANUAL_MINUTES
from ..errors import ApiError
from ..models import AIJob, AIProvider, AIToolSetting, User
from . import builtin, commands, providers
from .registry import IMAGE, LLM_DEFAULT, PROVIDER_PRESETS, TOOLS


def ensure_defaults(db: Session) -> None:
    for preset in PROVIDER_PRESETS:
        if not db.get(AIProvider, preset["id"]):
            db.add(AIProvider(**{k: v for k, v in preset.items()}))
    for tool_id, tool in TOOLS.items():
        if not db.get(AIToolSetting, tool_id):
            default_provider = "ollama" if tool_id in LLM_DEFAULT else ("builtin" if "builtin" in tool["kinds"] else "openai")
            db.add(AIToolSetting(tool_id=tool_id, provider_id=default_provider,
                                 enabled=not tool.get("generative", False)))
    db.commit()


def db_builtin(db: Session) -> AIProvider:
    return db.get(AIProvider, "builtin")


def resolve(db: Session, tool_id: str) -> tuple[AIToolSetting, AIProvider]:
    if tool_id not in TOOLS:
        raise ApiError(404, "unknown_tool", "Неизвестный AI-инструмент")
    setting = db.get(AIToolSetting, tool_id)
    if not setting or not setting.enabled:
        raise ApiError(409, "tool_disabled", "Этот инструмент отключён администратором")
    provider = db.get(AIProvider, setting.provider_id) or db.get(AIProvider, "builtin")
    return setting, provider


def _log(db: Session, tool_id: str, provider: AIProvider, model: str, user: Optional[User], object_id: str,
         status: str, started: float, error: str = "") -> AIJob:
    job = AIJob(tool_id=tool_id, provider_id=provider.id, model=model or provider.default_model or "",
                user_id=user.id if user else None, object_id=str(object_id), status=status,
                duration_ms=int((time.perf_counter() - started) * 1000),
                saved_minutes=MANUAL_MINUTES.get(tool_id, 2) if status != "error" else 0, error=error[:300])
    db.add(job)
    return job


def run_image(db: Session, tool_id: str, img: Image.Image, params: dict[str, Any], user: Optional[User],
              object_id: str = "") -> tuple[Image.Image, dict[str, Any]]:
    tool = TOOLS.get(tool_id)
    if not tool or tool["type"] != IMAGE:
        raise ApiError(404, "unknown_tool", "Неизвестный инструмент обработки")
    setting, provider = resolve(db, tool_id)
    merged = {**(setting.params or {}), **(params or {})}
    model = setting.model or provider.default_model
    started = time.perf_counter()
    fallback_reason = ""
    try:
        if not provider.enabled:
            raise providers.ProviderError(f"Провайдер «{provider.title}» выключен")
        if provider.kind == "builtin":
            if tool_id not in builtin.IMAGE_OPS:
                raise ApiError(409, "needs_provider",
                               "Для этого инструмента нужна генеративная модель — подключите её в админке")
            out = builtin.IMAGE_OPS[tool_id](img, **merged)
            model = builtin.model_name(tool_id, merged)
        elif provider.kind == "http_image":
            out = providers.http_image(provider, tool_id, model, img, merged)
        elif provider.kind == "openai":
            prompt = tool.get("prompt", "Improve this photo for print.")
            prompt = prompt.replace("{scene}", str(merged.get("scene", ""))[:120])
            out = providers.image_edit(provider, setting.model or provider.image_model, img, prompt)
        else:
            raise providers.ProviderError("Неизвестный тип провайдера")
        job = _log(db, tool_id, provider, model, user, object_id, "ok", started)
        return out, {"provider": provider.id, "provider_title": provider.title, "model": job.model,
                     "status": "ok", "duration_ms": job.duration_ms, "saved_minutes": job.saved_minutes}
    except ApiError:
        raise
    except Exception as e:  # сбой провайдера → встроенный фолбэк
        fallback_reason = str(e)
        if setting.fallback_builtin and tool_id in builtin.IMAGE_OPS and provider.kind != "builtin":
            out = builtin.IMAGE_OPS[tool_id](img, **merged)
            fb = db.get(AIProvider, "builtin")
            mname = builtin.model_name(tool_id, merged)
            job = _log(db, tool_id, fb, mname, user, object_id, "fallback", started, fallback_reason)
            return out, {"provider": "builtin", "provider_title": fb.title, "model": mname,
                         "status": "fallback", "fallback_reason": fallback_reason,
                         "duration_ms": job.duration_ms, "saved_minutes": job.saved_minutes}
        _log(db, tool_id, provider, model, user, object_id, "error", started, fallback_reason)
        db.commit()
        raise ApiError(502, "ai_failed", f"AI-инструмент не смог обработать фото: {fallback_reason}")


def run_text(db: Session, tool_id: str, user: Optional[User], payload: dict[str, Any],
             object_id: str = "") -> dict[str, Any]:
    """Текстовые задачи: command, captions, support_reply. Возвращает результат + метаданные."""
    setting, provider = resolve(db, tool_id)
    started = time.perf_counter()
    model = setting.model or provider.default_model
    builtin_result = _builtin_text(tool_id, payload)
    if provider.kind == "builtin" or not provider.enabled:
        _log(db, tool_id, db.get(AIProvider, "builtin"), "picpac-rules-1", user, object_id, "ok", started)
        return {**builtin_result, "_meta": {"provider": "builtin", "model": "picpac-rules-1", "status": "ok"}}
    try:
        result = _llm_text(provider, model, tool_id, payload)
        _log(db, tool_id, provider, model, user, object_id, "ok", started)
        return {**result, "_meta": {"provider": provider.id, "model": model, "status": "ok"}}
    except Exception as e:
        _log(db, tool_id, provider, model, user, object_id, "fallback", started, str(e))
        return {**builtin_result, "_meta": {"provider": "builtin", "model": "picpac-rules-1",
                                            "status": "fallback", "fallback_reason": str(e)}}


def _builtin_text(tool_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    if tool_id == "command":
        return commands.builtin_plan(payload.get("text", ""), bool(payload.get("has_selection")))
    if tool_id == "captions":
        pages = payload.get("pages", [])
        caps = []
        for p in pages:
            parts = [x for x in (p.get("date"), p.get("place")) if x]
            caps.append(" · ".join(parts) if parts else "")
        return {"title": payload.get("title") or "Наши моменты", "captions": caps}
    if tool_id == "support_reply":
        o = payload.get("order") or {}
        status = o.get("status_label")
        text = "Здравствуйте! Спасибо, что написали нам."
        if o:
            text += f" Ваш заказ {o.get('number')} сейчас в статусе «{status}»."
            if o.get("eta"):
                text += f" Ориентировочная дата готовности — {o['eta']}."
        text += " Мы проверили обращение и вернёмся с ответом в течение рабочего дня. Команда picPac"
        return {"text": text}
    return {}


def _llm_text(provider: AIProvider, model: str, tool_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    if tool_id == "command":
        msgs = [{"role": "system", "content": commands.SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps({
                    "has_selection": bool(payload.get("has_selection")),
                    "pages": payload.get("pages_count"), "title": payload.get("title"),
                }, ensure_ascii=False) + "\nПросьба клиента: <<<" + payload.get("text", "")[:600] + ">>>"}]
        raw = providers.extract_json(providers.chat(provider, model, msgs, temperature=0.1))
        plan = commands.ground_plan(commands.validate_plan(raw), payload.get("text", ""))
        if not plan["actions"] and not plan["reply"]:
            raise providers.ProviderError("empty plan")
        # Страховка для небольших локальных моделей: добавляем действия, которые явно названы в просьбе,
        # но модель пропустила (разбор по правилам из белого списка)
        key = lambda a: (a["type"], a.get("tool"), (a.get("params") or {}).get("style"), a.get("op"))
        have = {key(a) for a in plan["actions"]}
        rules = commands.builtin_plan(payload.get("text", ""), bool(payload.get("has_selection")))
        plan["actions"] += [a for a in rules["actions"] if key(a) not in have][: 8 - len(plan["actions"])]
        return plan
    if tool_id == "captions":
        msgs = [{"role": "system", "content": commands.CAPTIONS_PROMPT},
                {"role": "user", "content": "<<<" + json.dumps(payload, ensure_ascii=False)[:4000] + ">>>"}]
        raw = providers.extract_json(providers.chat(provider, model, msgs, temperature=0.7))
        caps = [str(c)[:80] for c in raw.get("captions", [])]
        return {"title": str(raw.get("title", payload.get("title", "")))[:60], "captions": caps}
    if tool_id == "support_reply":
        msgs = [{"role": "system", "content": commands.SUPPORT_PROMPT},
                {"role": "user", "content": "<<<" + json.dumps(payload, ensure_ascii=False)[:4000] + ">>>"}]
        return {"text": providers.strip_think(providers.chat(provider, model, msgs, temperature=0.4))[:1200]}
    return {}
