"""Универсальная админка моделей (как Django admin): список, поиск, просмотр, правка, создание, удаление.
Доступна только администратору. Секретные поля скрываются, служебные — только для чтения."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy import Boolean, Float, Integer, String, Text, or_
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..errors import ApiError
from .. import models as m
from ..security import hash_password, require_role

router = APIRouter(prefix="/api/admin/db", tags=["db-admin"])
admin = require_role("admin")

# Регистрация моделей: группа, название, поля в списке, поиск, разрешения
REGISTRY: dict[str, dict[str, Any]] = {
    "users": {"model": m.User, "group": "Пользователи", "title": "Пользователи", "list": ["id", "email", "name", "role", "is_guest", "created_at"],
              "search": ["email", "name"], "create": True, "delete": True},
    "orders": {"model": m.Order, "group": "Магазин", "title": "Заказы", "list": ["id", "number", "status", "stage", "total_minor", "channel", "created_at"],
               "search": ["number"], "create": False, "delete": False},
    "products": {"model": m.Product, "group": "Магазин", "title": "Продукты", "list": ["id", "title", "category", "kind", "base_price_minor", "active"],
                 "search": ["id", "title"], "create": False, "delete": False},
    "promo_codes": {"model": m.PromoCode, "group": "Магазин", "title": "Промокоды", "list": ["code", "kind", "value", "min_total_minor", "active"],
                    "search": ["code"], "create": True, "delete": True},
    "projects": {"model": m.Project, "group": "Контент", "title": "Проекты", "list": ["id", "title", "product_id", "status", "revision", "updated_at"],
                 "search": ["title"], "create": False, "delete": True},
    "photos": {"model": m.Photo, "group": "Контент", "title": "Фотографии", "list": ["id", "filename", "width", "height", "source", "ai_tool", "created_at"],
               "search": ["filename"], "create": False, "delete": False},
    "support_tickets": {"model": m.SupportTicket, "group": "Поддержка", "title": "Обращения", "list": ["id", "subject", "topic", "status", "channel", "created_at"],
                        "search": ["subject"], "create": False, "delete": False},
    "notifications": {"model": m.Notification, "group": "Поддержка", "title": "Уведомления", "list": ["id", "user_id", "title", "read", "created_at"],
                      "search": ["title"], "create": False, "delete": True},
    "themes": {"model": m.Theme, "group": "Оформление", "title": "Свои темы", "list": ["id", "name", "mode", "created_at"],
               "search": ["name"], "create": False, "delete": True},
    "ai_providers": {"model": m.AIProvider, "group": "AI", "title": "AI-провайдеры", "list": ["id", "title", "kind", "default_model", "enabled"],
                     "search": ["title"], "create": False, "delete": False},
    "ai_tool_settings": {"model": m.AIToolSetting, "group": "AI", "title": "AI-инструменты", "list": ["tool_id", "provider_id", "model", "enabled", "fallback_builtin"],
                         "search": ["tool_id"], "create": False, "delete": False},
    "ai_jobs": {"model": m.AIJob, "group": "AI", "title": "AI-задачи", "list": ["id", "tool_id", "provider_id", "model", "status", "duration_ms", "created_at"],
                "search": ["tool_id", "model"], "create": False, "delete": False, "readonly": True},
    "photo_events": {"model": m.PhotoEvent, "group": "Журналы", "title": "Конвейер фото", "list": ["id", "photo_id", "kind", "actor", "title", "created_at"],
                     "search": ["title", "kind"], "create": False, "delete": False, "readonly": True},
    "telegram_links": {"model": m.TelegramLink, "group": "Поддержка", "title": "Telegram-подписки", "list": ["user_id", "username", "tg_name", "enabled", "linked_at"],
                       "search": ["username", "tg_name"], "create": False, "delete": True},
    "audit_log": {"model": m.AuditLog, "group": "Журналы", "title": "Аудит", "list": ["id", "user_label", "action", "object_type", "object_id", "result", "created_at"],
                  "search": ["action", "user_label"], "create": False, "delete": False, "readonly": True},
}
HIDDEN = {"password_hash", "api_key"}
HIDDEN_BY_TABLE = {"telegram_links": {"code", "chat_id"}}  # секрет привязки и id чата не показываем
READONLY = {"id", "created_at", "updated_at", "idempotency_key", "phash", "path", "thumb_path"}


def _kind(col) -> str:
    t = col.type
    if isinstance(t, Boolean):
        return "bool"
    if isinstance(t, (Integer, Float)):
        return "number"
    if isinstance(t, Text):
        return "text"
    if isinstance(t, String):
        return "string"
    if t.__class__.__name__ == "TZDateTime":
        return "datetime"
    if t.__class__.__name__ == "JSON":
        return "json"
    return "string"


def _fields(model) -> list[dict[str, Any]]:
    out = []
    for c in model.__table__.columns:
        if c.name in HIDDEN or c.name in HIDDEN_BY_TABLE.get(model.__tablename__, ()):
            continue
        out.append({"name": c.name, "kind": _kind(c), "pk": c.primary_key,
                    "readonly": c.primary_key or c.name in READONLY, "nullable": c.nullable})
    return out


def _ser(v: Any) -> Any:
    if isinstance(v, datetime):
        return v.isoformat()
    return v


def _row(obj, fields) -> dict[str, Any]:
    return {f["name"]: _ser(getattr(obj, f["name"])) for f in fields}


def _reg(name: str) -> dict[str, Any]:
    if name not in REGISTRY:
        raise ApiError(404, "unknown_model", "Нет такой модели")
    return REGISTRY[name]


@router.get("")
def models_list(user=Depends(admin), db: Session = Depends(get_db)):
    return {"models": [{"id": k, "title": v["title"], "group": v["group"], "count": db.query(v["model"]).count(),
                        "readonly": v.get("readonly", False), "create": v["create"]} for k, v in REGISTRY.items()]}


@router.get("/{name}")
def rows(name: str, q: Optional[str] = None, page: int = 1, per_page: int = 25, user=Depends(admin), db: Session = Depends(get_db)):
    reg = _reg(name)
    model = reg["model"]
    query = db.query(model)
    if q:
        query = query.filter(or_(*[getattr(model, f).ilike(f"%{q}%") for f in reg["search"]]))
    total = query.count()
    pk = list(model.__table__.primary_key.columns)[0]
    order = model.created_at.desc() if hasattr(model, "created_at") else pk.desc()
    items = query.order_by(order).offset((max(1, page) - 1) * per_page).limit(min(per_page, 100)).all()
    fields = _fields(model)
    return {"model": {"id": name, "title": reg["title"], "group": reg["group"], "list": reg["list"],
                      "create": reg["create"], "delete": reg["delete"], "readonly": reg.get("readonly", False),
                      "pk": pk.name}, "fields": fields, "total": total, "page": page,
            "items": [_row(o, fields) for o in items]}


def _coerce(field: dict[str, Any], value: Any) -> Any:
    if value is None or value == "":
        return None if field["nullable"] else ("" if field["kind"] in ("string", "text") else value)
    if field["kind"] == "bool":
        return bool(value) if not isinstance(value, str) else value.lower() in ("1", "true", "да", "on")
    if field["kind"] == "number":
        return float(value) if "." in str(value) else int(value)
    if field["kind"] == "datetime":
        return datetime.fromisoformat(str(value))
    return value


@router.put("/{name}/{pk}")
def update(name: str, pk: str, body: dict[str, Any], request: Request, user=Depends(admin), db: Session = Depends(get_db)):
    reg = _reg(name)
    if reg.get("readonly"):
        raise ApiError(403, "readonly", "Журнал только для чтения")
    model = reg["model"]
    key = list(model.__table__.primary_key.columns)[0]
    obj = db.get(model, int(pk) if _kind(key) == "number" else pk)
    if not obj:
        raise ApiError(404, "not_found", "Запись не найдена")
    fields = {f["name"]: f for f in _fields(model)}
    changed = []
    for k, v in body.items():
        if k == "password" and name == "users" and v:
            obj.password_hash = hash_password(str(v))
            changed.append("password")
            continue
        f = fields.get(k)
        if not f or f["readonly"]:
            continue
        nv = _coerce(f, v)
        if getattr(obj, k) != nv:
            setattr(obj, k, nv)
            changed.append(k)
    audit(db, user, "db_update", name, pk, details={"fields": changed}, request=request)
    db.commit()
    return _row(obj, list(fields.values()))


@router.post("/{name}")
def create(name: str, body: dict[str, Any], request: Request, user=Depends(admin), db: Session = Depends(get_db)):
    reg = _reg(name)
    if not reg["create"]:
        raise ApiError(403, "no_create", "Создание недоступно для этой модели")
    model = reg["model"]
    fields = {f["name"]: f for f in _fields(model)}
    data = {k: _coerce(fields[k], v) for k, v in body.items() if k in fields and not (fields[k]["readonly"] and not fields[k]["pk"])}
    if name == "users":
        data["password_hash"] = hash_password(str(body.get("password") or "changeme123"))
    obj = model(**data)
    db.add(obj)
    db.flush()
    audit(db, user, "db_create", name, getattr(obj, list(model.__table__.primary_key.columns)[0].name), request=request)
    db.commit()
    return _row(obj, list(fields.values()))


@router.delete("/{name}/{pk}")
def delete(name: str, pk: str, request: Request, user=Depends(admin), db: Session = Depends(get_db)):
    reg = _reg(name)
    if not reg["delete"]:
        raise ApiError(403, "no_delete", "Удаление недоступно для этой модели")
    model = reg["model"]
    key = list(model.__table__.primary_key.columns)[0]
    obj = db.get(model, int(pk) if _kind(key) == "number" else pk)
    if not obj:
        raise ApiError(404, "not_found", "Запись не найдена")
    if name == "users" and obj.id == user.id:
        raise ApiError(409, "self_delete", "Нельзя удалить самого себя")
    db.delete(obj)
    audit(db, user, "db_delete", name, pk, request=request)
    db.commit()
    return {"ok": True}
