"""Конвейер фото для менеджера и администратора: что происходило с каждым снимком."""
from __future__ import annotations

from collections import Counter
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import imaging
from ..db import get_db
from ..errors import ApiError
from ..models import Order, Photo, PhotoEvent, Project, User
from ..security import require_role
from ..services import photo_advice, photo_public

router = APIRouter(prefix="/api/admin/pipeline", tags=["pipeline"])
manager = require_role("operator")

STAGES = [("uploaded", "Загружено"), ("analyzed", "Анализ"), ("advice", "Совет"),
          ("advice_accepted", "Принят совет"), ("advice_declined", "Оставлено как есть"),
          ("ai_applied", "AI-обработка"), ("robot_flagged", "Проверка Робота"), ("reverted", "Возврат оригинала"),
          ("ordered", "В заказе")]


@router.get("/stats")
def stats(user: User = Depends(manager), db: Session = Depends(get_db)):
    kinds = Counter(k for (k,) in db.query(PhotoEvent.kind).all())
    adv = Counter()
    acc = Counter()
    dec = Counter()
    for e in db.query(PhotoEvent).filter(PhotoEvent.kind.in_(["advice", "advice_accepted", "advice_declined"])).all():
        code = (e.details or {}).get("code", "?")
        {"advice": adv, "advice_accepted": acc, "advice_declined": dec}[e.kind][code] += 1
    tools = Counter((e.details or {}).get("tool") for e in db.query(PhotoEvent).filter_by(kind="ai_applied").all())
    return {"stages": [{"id": k, "title": t, "value": kinds.get(k, 0)} for k, t in STAGES],
            "advice": [{"code": c, "shown": adv[c], "accepted": acc[c], "declined": dec[c]} for c in adv],
            "tools": [{"tool": t, "count": n} for t, n in tools.most_common() if t]}


@router.get("/photos")
def photos(q: Optional[str] = None, limit: int = 60, user: User = Depends(manager), db: Session = Depends(get_db)):
    query = db.query(Photo).filter(Photo.source != "ai")
    if q:
        query = query.filter(Photo.filename.ilike(f"%{q}%"))
    items = query.order_by(Photo.created_at.desc()).limit(min(limit, 200)).all()
    ids = [p.id for p in items]
    ev = Counter()
    last: dict[str, PhotoEvent] = {}
    kinds: dict[str, set] = {}
    if ids:
        for e in db.query(PhotoEvent).filter(PhotoEvent.root_id.in_(ids)).order_by(PhotoEvent.id).all():
            ev[e.root_id] += 1
            last[e.root_id] = e
            kinds.setdefault(e.root_id, set()).add(e.kind)
    owners = {u.id: u for u in db.query(User).filter(User.id.in_({p.owner_id for p in items})).all()} if items else {}
    versions = Counter(pid for (pid,) in db.query(Photo.parent_id).filter(Photo.parent_id.in_(ids)).all()) if ids else {}
    out = []
    for p in items:
        k = kinds.get(p.id, set())
        out.append({**photo_public(p), "owner": (owners.get(p.owner_id).email or owners.get(p.owner_id).name) if owners.get(p.owner_id) else "—",
                    "events": ev.get(p.id, 0), "versions": versions.get(p.id, 0),
                    "last": {"kind": last[p.id].kind, "title": last[p.id].title, "at": last[p.id].created_at.isoformat()} if p.id in last else None,
                    "state": "ordered" if "ordered" in k else "ai" if "ai_applied" in k else
                             "declined" if "advice_declined" in k else "advised" if "advice" in k else "ok"})
    return {"items": out}


@router.get("/photos/{photo_id}")
def photo_trace(photo_id: str, user: User = Depends(manager), db: Session = Depends(get_db)):
    p = db.get(Photo, photo_id)
    if not p:
        raise ApiError(404, "photo_not_found", "Фото не найдено")
    root = db.get(Photo, p.parent_id) if p.parent_id else p
    versions = db.query(Photo).filter(Photo.parent_id == root.id).order_by(Photo.created_at).all()
    events = db.query(PhotoEvent).filter(PhotoEvent.root_id == root.id).order_by(PhotoEvent.id).all()
    project = db.get(Project, root.project_id) if root.project_id else None
    orders = []
    if project:
        orders = [{"id": o.id, "number": o.number, "status": o.status} for o in db.query(Order).filter_by(project_id=project.id).all()]
    owner = db.get(User, root.owner_id)
    return {
        "photo": photo_public(root), "owner": owner.email or owner.name if owner else "—",
        "analysis": {"sharpness": round(imaging.sharpness_norm(root.sharpness), 2), "sharpness_raw": root.sharpness,
                     "brightness": root.brightness, "faces": root.faces, "score": root.score, "phash": root.phash,
                     "width": root.width, "height": root.height, "advice": photo_advice(root)},
        "versions": [photo_public(v) for v in versions],
        "events": [{"id": e.id, "kind": e.kind, "actor": e.actor, "title": e.title, "details": e.details,
                    "photo_id": e.photo_id, "created_at": e.created_at.isoformat()} for e in events],
        "project": {"id": project.id, "title": project.title, "status": project.status} if project else None,
        "orders": orders,
    }
