"""Цветовые темы и дизайн-шаблоны. Фиксированные темы и шаблоны — в config_data/*.json,
пользовательские темы администратор создаёт в админке (хранятся в БД)."""
from __future__ import annotations

import json
import re
from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..audit import audit
from ..config import CONFIG_DATA
from ..db import get_db
from ..errors import ApiError
from ..models import AppSetting, Theme, User
from ..security import require_role

router = APIRouter(tags=["themes"])
admin = require_role("admin")
COLOR_KEYS = ["primary", "primaryInk", "bg", "surface", "surface2", "text", "muted", "line", "success", "warning",
              "danger", "info", "glow1", "glow2", "glow3"]
HEX = re.compile(r"^(#[0-9a-fA-F]{6}|rgba?\([\d\s.,]+\))$")


def _config() -> dict[str, Any]:
    return json.loads((CONFIG_DATA / "themes.json").read_text(encoding="utf-8"))


def all_themes(db: Session) -> dict[str, Any]:
    cfg = _config()
    fixed = cfg["themes"]
    custom = [{"id": t.id, "name": t.name, "family": t.family, "mode": t.mode, "fixed": False, "colors": t.colors}
              for t in db.query(Theme).order_by(Theme.created_at).all()]
    setting = db.get(AppSetting, "default_theme")
    ids = {t["id"] for t in fixed + custom}
    default = setting.value if setting and setting.value in ids else cfg["default"]
    return {"default": default, "themes": fixed + custom}


@router.get("/api/themes")
def themes(db: Session = Depends(get_db)):
    return all_themes(db)


@router.get("/api/templates")
def templates():
    """Дизайны: сначала иллюстрированные (фон-иллюстрация + рамки + шрифт), затем простые цветовые."""
    base = json.loads((CONFIG_DATA / "templates.json").read_text(encoding="utf-8"))
    art_file = CONFIG_DATA / "designs_art.json"
    art = json.loads(art_file.read_text(encoding="utf-8"))["designs"] if art_file.exists() else []
    ids = {d["id"] for d in art}
    base["templates"] = art + [t for t in base["templates"] if t["id"] not in ids]
    return base


class ThemeIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    mode: str = Field(pattern="^(light|dark)$")
    colors: dict[str, str]


def _validate(colors: dict[str, str]) -> dict[str, str]:
    missing = [k for k in COLOR_KEYS if k not in colors]
    if missing:
        raise ApiError(422, "bad_theme", f"Не хватает цветов: {', '.join(missing)}")
    for k in COLOR_KEYS:
        if not HEX.match(colors[k].strip()):
            raise ApiError(422, "bad_theme", f"Неверный цвет «{k}»: {colors[k]}")
    return {k: colors[k].strip() for k in COLOR_KEYS}


@router.post("/api/admin/themes")
def create_theme(body: ThemeIn, request: Request, user: User = Depends(admin), db: Session = Depends(get_db)):
    slug = re.sub(r"[^a-z0-9]+", "-", body.name.lower().encode("ascii", "ignore").decode()).strip("-") or "theme"
    tid = f"custom-{slug}-{body.mode}"
    n = 1
    while db.get(Theme, tid) or tid in {t["id"] for t in _config()["themes"]}:
        n += 1
        tid = f"custom-{slug}-{body.mode}-{n}"
    t = Theme(id=tid, name=body.name, mode=body.mode, colors=_validate(body.colors))
    db.add(t)
    audit(db, user, "theme_create", "theme", tid, request=request)
    db.commit()
    return {"id": tid}


@router.put("/api/admin/themes/{theme_id}")
def update_theme(theme_id: str, body: ThemeIn, request: Request, user: User = Depends(admin), db: Session = Depends(get_db)):
    t = db.get(Theme, theme_id)
    if not t:
        raise ApiError(409, "fixed_theme", "Фиксированные темы меняются в файле config_data/themes.json")
    t.name, t.mode, t.colors = body.name, body.mode, _validate(body.colors)
    audit(db, user, "theme_update", "theme", theme_id, request=request)
    db.commit()
    return {"ok": True}


@router.delete("/api/admin/themes/{theme_id}")
def delete_theme(theme_id: str, request: Request, user: User = Depends(admin), db: Session = Depends(get_db)):
    t = db.get(Theme, theme_id)
    if not t:
        raise ApiError(409, "fixed_theme", "Фиксированную тему удалить нельзя")
    db.delete(t)
    s = db.get(AppSetting, "default_theme")
    if s and s.value == theme_id:
        db.delete(s)
    audit(db, user, "theme_delete", "theme", theme_id, request=request)
    db.commit()
    return {"ok": True}


class DefaultIn(BaseModel):
    id: str


@router.put("/api/admin/themes-default")
def set_default(body: DefaultIn, request: Request, user: User = Depends(admin), db: Session = Depends(get_db)):
    if body.id not in {t["id"] for t in all_themes(db)["themes"]}:
        raise ApiError(404, "not_found", "Тема не найдена")
    s = db.get(AppSetting, "default_theme")
    if s:
        s.value = body.id
    else:
        db.add(AppSetting(key="default_theme", value=body.id))
    audit(db, user, "theme_default", "theme", body.id, request=request)
    db.commit()
    return {"ok": True}
