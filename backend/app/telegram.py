"""Telegram-бот picPac: уведомления клиента об этапах заказа.

Настройка: токен и имя бота — в Studio → Настройки → Telegram (или переменные TELEGRAM_BOT_TOKEN /
TELEGRAM_BOT_USERNAME). Пока токена нет, приложение работает как обычно, сообщения просто не отправляются.

Привязка: клиент в профиле нажимает «Подключить Telegram» → открывается t.me/<бот>?start=<код> →
кнопка Start → бот получает /start <код> (long polling) и запоминает chat_id. Отключить — /stop или в профиле."""
from __future__ import annotations

import asyncio
import logging
import os
import queue
import threading
from typing import Any, Optional

import httpx

from .db import SessionLocal, utcnow

log = logging.getLogger("picpac.telegram")
API = "https://api.telegram.org/bot{token}/{method}"
_outbox: "queue.Queue[tuple[str, str]]" = queue.Queue(maxsize=1000)
_state: dict[str, Any] = {"offset": 0, "last_error": "", "sent": 0, "bot": None}


def config(db=None) -> dict[str, str]:
    from .models import AppSetting
    close = db is None
    db = db or SessionLocal()
    try:
        tok = db.get(AppSetting, "telegram_token")
        name = db.get(AppSetting, "telegram_bot_username")
        return {"token": (tok.value if tok else "") or os.getenv("TELEGRAM_BOT_TOKEN", ""),
                "username": ((name.value if name else "") or os.getenv("TELEGRAM_BOT_USERNAME", "")).lstrip("@")}
    finally:
        if close:
            db.close()


def call(token: str, method: str, http_timeout: float = 10, **params) -> Any:
    r = httpx.post(API.format(token=token, method=method), json=params, timeout=http_timeout)
    data = r.json()
    if not data.get("ok"):
        raise RuntimeError(data.get("description", f"HTTP {r.status_code}"))
    return data["result"]


def enqueue(chat_id: Optional[str], text: str) -> None:
    if chat_id:
        try:
            _outbox.put_nowait((chat_id, text))
        except queue.Full:  # pragma: no cover
            pass


def notify_user(db, user_id: int, title: str, body: str, link: str = "") -> None:
    """Вызывается вместе с уведомлением в приложении; отправка — в фоне, запрос не ждёт Telegram."""
    from .models import TelegramLink
    tl = db.get(TelegramLink, user_id)
    if tl and tl.enabled and tl.chat_id:
        enqueue(tl.chat_id, f"<b>{_esc(title)}</b>\n{_esc(body)}")


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _sender() -> None:
    while True:
        chat_id, text = _outbox.get()
        cfg = config()
        if not cfg["token"]:
            continue
        try:
            call(cfg["token"], "sendMessage", chat_id=chat_id, text=text, parse_mode="HTML", disable_web_page_preview=True)
            _state["sent"] += 1
        except Exception as e:  # pragma: no cover
            _state["last_error"] = str(e)[:200]
            log.warning("telegram send failed: %s", e)


def _handle(update: dict[str, Any], token: str) -> None:
    from .models import TelegramLink
    msg = update.get("message") or {}
    text = (msg.get("text") or "").strip()
    chat = msg.get("chat") or {}
    if not text or not chat:
        return
    db = SessionLocal()
    try:
        if text.startswith("/start"):
            code = text.split(maxsplit=1)[1].strip() if " " in text else ""
            tl = db.query(TelegramLink).filter_by(code=code).first() if code else None
            if not tl:
                call(token, "sendMessage", chat_id=chat["id"], text="Привет! Это бот picPac 📸 Чтобы получать статусы заказов, "
                     "нажмите «Подключить Telegram» в профиле приложения.")
                return
            tl.chat_id, tl.enabled, tl.linked_at = str(chat["id"]), True, utcnow()
            frm = msg.get("from") or {}
            tl.tg_name = (frm.get("first_name") or "") + (f" @{frm['username']}" if frm.get("username") else "")
            db.commit()
            call(token, "sendMessage", chat_id=chat["id"], text="Готово! 🐱 Кот и 🤖 Робот будут присылать сюда этапы ваших заказов: "
                 "печать, контроль качества, доставку и готовность к выдаче. Отключить — /stop")
        elif text.startswith("/stop"):
            for tl in db.query(TelegramLink).filter_by(chat_id=str(chat["id"])).all():
                tl.enabled = False
            db.commit()
            call(token, "sendMessage", chat_id=chat["id"], text="Уведомления отключены. Включить снова можно в профиле picPac.")
    except Exception as e:  # pragma: no cover
        log.warning("telegram update failed: %s", e)
    finally:
        db.close()


def _poll_once() -> None:
    cfg = config()
    if not cfg["token"]:
        return
    try:
        updates = call(cfg["token"], "getUpdates", http_timeout=35, offset=_state["offset"], timeout=25,
                       allowed_updates=["message"])
        for u in updates:
            _state["offset"] = u["update_id"] + 1
            _handle(u, cfg["token"])
        _state["last_error"] = ""
    except Exception as e:  # сеть/токен — пробуем снова позже
        _state["last_error"] = str(e)[:200]


async def loop() -> None:
    threading.Thread(target=_sender, daemon=True, name="tg-sender").start()
    while True:
        if config()["token"]:
            await asyncio.to_thread(_poll_once)
            await asyncio.sleep(1)
        else:
            await asyncio.sleep(10)


def status() -> dict[str, Any]:
    cfg = config()
    return {"configured": bool(cfg["token"]), "bot_username": cfg["username"], "sent": _state["sent"], "last_error": _state["last_error"]}
