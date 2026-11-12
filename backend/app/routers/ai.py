from __future__ import annotations

import copy

import io
from typing import Any, Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from .. import imaging
from ..ai import engine as ai
from ..ai.registry import IMAGE, TOOLS, tool_public
from ..audit import audit
from ..db import get_db, utcnow
from ..errors import ApiError
from ..models import AIProvider, AIToolSetting, Photo, Project, User
from ..security import current_user
from ..services import can_access_photo, can_access_project, create_photo, photo_event, photo_public

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.get("/tools")
def tools(user: User = Depends(current_user), db: Session = Depends(get_db)):
    out = []
    for tool_id, t in TOOLS.items():
        s = db.get(AIToolSetting, tool_id)
        if not s or not s.enabled:
            continue
        p = db.get(AIProvider, s.provider_id)
        out.append({**tool_public(tool_id), "provider": p.title if p else "", "provider_kind": p.kind if p else "",
                    "location": p.location if p else "", "model": s.model or (p.default_model if p else "")})
    return {"items": out}


class ApplyIn(BaseModel):
    tool: str
    params: dict[str, Any] = {}
    project_id: Optional[str] = None
    replace: bool = True


def _photo(db: Session, user: User, photo_id: str) -> Photo:
    p = db.get(Photo, photo_id)
    if not p or not can_access_photo(db, user, p):
        raise ApiError(404, "photo_not_found", "Фото не найдено")
    return p


def _swap(layout: dict[str, Any], old: str, new: str) -> int:
    n = 0
    for pg in layout.get("pages", []):
        for s in pg.get("slots", []):
            if s.get("photo_id") == old:
                s["photo_id"] = new
                n += 1
    cover = layout.get("cover") or {}
    if cover.get("photo_id") == old:
        cover["photo_id"] = new
        n += 1
    return n


@router.post("/photos/{photo_id}/preview")
def preview(photo_id: str, body: ApplyIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Быстрый предпросмотр «до/после» на уменьшенной копии — без сохранения."""
    p = _photo(db, user, photo_id)
    img = imaging.load_media(p.thumb_path)
    if body.tool == "upscale":  # для превью показываем увеличение фрагмента
        w, h = img.size
        img = img.crop((w // 4, h // 4, w * 3 // 4, h * 3 // 4))
    out, meta = ai.run_image(db, body.tool, img, body.params, user, p.id)
    db.commit()
    buf = io.BytesIO()
    out.convert("RGB").save(buf, "JPEG", quality=85)
    return Response(buf.getvalue(), media_type="image/jpeg",
                    headers={"X-AI-Provider": meta["provider"], "X-AI-Status": meta["status"],
                             "X-AI-Duration": str(meta["duration_ms"]), "Cache-Control": "no-store"})


@router.post("/photos/{photo_id}/apply")
def apply(photo_id: str, body: ApplyIn, request: Request, user: User = Depends(current_user),
          db: Session = Depends(get_db)):
    """Применяет инструмент к оригиналу; создаёт новую версию фото (оригинал сохраняется для отмены)."""
    p = _photo(db, user, photo_id)
    if body.tool not in TOOLS or TOOLS[body.tool]["type"] != IMAGE:
        raise ApiError(404, "unknown_tool", "Неизвестный инструмент")
    img = imaging.load_media(p.path)
    out, meta = ai.run_image(db, body.tool, img, body.params, user, p.id)
    new = create_photo(db, user if p.owner_id == user.id else db.get(User, p.owner_id), out.convert("RGB"),
                       p.filename, source="ai", taken_at=p.taken_at, place=p.place, project_id=p.project_id,
                       parent_id=p.parent_id or p.id, ai_tool=body.tool)
    from ..ai.registry import TOOLS as _T
    photo_event(db, p, "ai_applied", f"{_T[body.tool]['title']} → новая версия", "ai",
                {"tool": body.tool, "params": body.params, "new_photo": new.id, "provider": meta["provider"],
                 "model": meta["model"], "status": meta["status"], "duration_ms": meta["duration_ms"]}, user_id=user.id)
    swapped = 0
    revision = None
    if body.project_id and body.replace:
        project = db.get(Project, body.project_id)
        if project and can_access_project(db, user, project) and project.status == "draft":
            layout = copy.deepcopy(project.layout)
            root_id = p.parent_id or p.id
            family = {root_id} | {x.id for x in db.query(Photo).filter(Photo.parent_id == root_id).all()}
            swapped = sum(_swap(layout, fid, new.id) for fid in family if fid != new.id)
            project.layout = layout
            flag_modified(project, "layout")
            project.revision += 1
            project.updated_at = utcnow()
            revision = project.revision
    audit(db, user, "ai_apply", "photo", p.id,
          details={"tool": body.tool, "new_photo": new.id, **{k: meta[k] for k in ("provider", "status")}},
          request=request)
    db.commit()
    return {"photo": photo_public(new), "replaced": swapped, "project_revision": revision, "ai": meta}


@router.post("/photos/{photo_id}/revert")
def revert(photo_id: str, project_id: str, request: Request, user: User = Depends(current_user),
           db: Session = Depends(get_db)):
    p = _photo(db, user, photo_id)
    if not p.parent_id:
        raise ApiError(409, "no_original", "Это уже оригинал")
    project = db.get(Project, project_id)
    if not project or not can_access_project(db, user, project):
        raise ApiError(404, "project_not_found", "Проект не найден")
    layout = copy.deepcopy(project.layout)
    n = _swap(layout, p.id, p.parent_id)
    project.layout = layout
    flag_modified(project, "layout")
    project.revision += 1
    photo_event(db, p, "reverted", "Возврат к оригиналу", "user", {"to": p.parent_id}, project_id=project_id, user_id=user.id)
    audit(db, user, "ai_revert", "photo", p.id, details={"to": p.parent_id}, request=request)
    db.commit()
    return {"photo": photo_public(db.get(Photo, p.parent_id)), "replaced": n, "project_revision": project.revision}


class CommandIn(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    project_id: Optional[str] = None
    selected_photo_id: Optional[str] = None


@router.post("/command")
def command(body: CommandIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Кот-ассистент возвращает ПЛАН. Выполняет его клиент шаг за шагом, у пользователя есть отмена."""
    pages = None
    title = None
    if body.project_id:
        project = db.get(Project, body.project_id)
        if not project or not can_access_project(db, user, project):
            raise ApiError(404, "project_not_found", "Проект не найден")
        pages, title = len(project.layout.get("pages", [])), project.title
    res = ai.run_text(db, "command", user, {"text": body.text, "has_selection": bool(body.selected_photo_id),
                                             "pages_count": pages, "title": title}, body.project_id or "")
    audit(db, user, "ai_command", "project", body.project_id or "-",
          details={"actions": len(res.get("actions", [])), **res.get("_meta", {})}, request=request)
    db.commit()
    return res
