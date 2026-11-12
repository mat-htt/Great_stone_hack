"""Telegram: клиент по желанию подключает бота для статусов заказа; администратор задаёт токен бота."""
from __future__ import annotations

import re
import secrets

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import telegram
from ..audit import audit
from ..db import get_db
from ..errors import ApiError
from ..models import AppSetting, TelegramLink, User
from ..security import current_user, require_role

router = APIRouter(tags=["telegram"])
admin = require_role("admin")
NICK = re.compile(r"^@?[A-Za-z0-9_]{4,32}$")


def _me(db: Session, user: User) -> dict:
    cfg = telegram.config(db)
    tl = db.get(TelegramLink, user.id)
    link = f"https://t.me/{cfg['username']}?start={tl.code}" if tl and cfg["username"] else None
    return {"configured": bool(cfg["token"]), "bot_username": cfg["username"] or None,
            "requested": bool(tl), "linked": bool(tl and tl.chat_id), "enabled": bool(tl and tl.enabled),
            "username": tl.username if tl else "", "tg_name": tl.tg_name if tl else "", "link": link}


class LinkIn(BaseModel):
    username: str = Field(default="", max_length=40)


class ToggleIn(BaseModel):
    enabled: bool


@router.get("/api/telegram/me")
def tg_me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _me(db, user)


@router.post("/api/telegram/me")
def tg_link(body: LinkIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    nick = body.username.strip()
    if nick and not NICK.match(nick):
        raise ApiError(422, "bad_username", "Ник в Telegram — латиница, цифры и _, от 4 символов")
    tl = db.get(TelegramLink, user.id)
    if not tl:
        tl = TelegramLink(user_id=user.id, code=secrets.token_urlsafe(12))
        db.add(tl)
    tl.username, tl.enabled = nick.lstrip("@"), True
    db.commit()
    return _me(db, user)


@router.put("/api/telegram/me")
def tg_toggle(body: ToggleIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    tl = db.get(TelegramLink, user.id)
    if not tl:
        raise ApiError(404, "not_linked", "Telegram не подключён")
    tl.enabled = body.enabled
    db.commit()
    return _me(db, user)


@router.delete("/api/telegram/me")
def tg_unlink(user: User = Depends(current_user), db: Session = Depends(get_db)):
    tl = db.get(TelegramLink, user.id)
    if tl:
        db.delete(tl)
        db.commit()
    return _me(db, user)


@router.post("/api/telegram/me/test")
def tg_test(user: User = Depends(current_user), db: Session = Depends(get_db)):
    tl = db.get(TelegramLink, user.id)
    if not (tl and tl.chat_id):
        raise ApiError(409, "not_linked", "Сначала нажмите Start в боте")
    if not telegram.config(db)["token"]:
        raise ApiError(503, "bot_not_configured", "Бот ещё не настроен администратором")
    telegram.enqueue(tl.chat_id, "Проверка связи 🐱🤖 Так будут выглядеть уведомления о заказах picPac.")
    return {"ok": True}


# ---------- админка ----------

class BotIn(BaseModel):
    token: str = Field(default="", max_length=120)
    bot_username: str = Field(default="", max_length=40)


def _set(db: Session, key: str, value: str) -> None:
    s = db.get(AppSetting, key)
    if s:
        s.value = value
    else:
        db.add(AppSetting(key=key, value=value))


@router.get("/api/admin/telegram")
def bot_state(user: User = Depends(admin), db: Session = Depends(get_db)):
    st = telegram.status()
    tok = telegram.config(db)["token"]
    st.update(token_hint=(tok[:4] + "…" + tok[-4:]) if tok else "",
              linked=db.query(TelegramLink).filter(TelegramLink.chat_id.isnot(None)).count(),
              waiting=db.query(TelegramLink).filter(TelegramLink.chat_id.is_(None)).count())
    return st


@router.put("/api/admin/telegram")
def bot_set(body: BotIn, request: Request, user: User = Depends(admin), db: Session = Depends(get_db)):
    token = body.token.strip()
    if token and not re.match(r"^\d{5,}:[A-Za-z0-9_-]{30,}$", token):
        raise ApiError(422, "bad_token", "Похоже, это не токен от @BotFather (формат 123456:ABC…)")
    name = body.bot_username.strip().lstrip("@")
    if token:
        try:
            me = telegram.call(token, "getMe")
            name = me.get("username") or name
        except Exception as e:
            raise ApiError(400, "token_rejected", f"Telegram не принял токен: {e}")
        _set(db, "telegram_token", token)
    if name:
        _set(db, "telegram_bot_username", name)
    audit(db, user, "telegram_update", "telegram", name or "-", details={"token_changed": bool(token)}, request=request)
    db.commit()
    return bot_state(user, db)


@router.delete("/api/admin/telegram")
def bot_clear(request: Request, user: User = Depends(admin), db: Session = Depends(get_db)):
    for k in ("telegram_token", "telegram_bot_username"):
        s = db.get(AppSetting, k)
        if s:
            db.delete(s)
    audit(db, user, "telegram_clear", "telegram", "-", request=request)
    db.commit()
    return bot_state(user, db)
