from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import AnalyticsEvent, Notification, User
from ..security import current_user, optional_user

router = APIRouter(prefix="/api", tags=["misc"])

ALLOWED_EVENTS = {"app_open", "product_view", "project_created", "photos_added", "preflight_passed",
                  "checkout_started", "order_created", "ai_used", "share_created", "memory_opened"}


@router.get("/notifications")
def notifications(since_id: int = 0, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = db.query(Notification).filter(Notification.user_id == user.id, Notification.id > since_id)
    items = q.order_by(Notification.id.desc()).limit(50).all()
    unread = db.query(Notification).filter_by(user_id=user.id, read=False).count()
    return {"unread": unread, "items": [{"id": n.id, "title": n.title, "body": n.body, "link": n.link,
                                         "mascot": n.mascot, "read": n.read, "created_at": n.created_at.isoformat()}
                                        for n in items]}


@router.post("/notifications/read")
def mark_read(user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.query(Notification).filter_by(user_id=user.id, read=False).update({"read": True})
    db.commit()
    return {"ok": True}


class EventIn(BaseModel):
    session: str = Field(min_length=4, max_length=40)
    name: str
    props: dict[str, Any] = {}


@router.post("/events")
def track(body: EventIn, user: Optional[User] = Depends(optional_user), db: Session = Depends(get_db)):
    """Аналитика воронки (обезличенно, без содержимого фото)."""
    if body.name in ALLOWED_EVENTS:
        props = {k: v for k, v in list(body.props.items())[:6] if isinstance(v, (str, int, float, bool))}
        db.add(AnalyticsEvent(session=body.session, user_id=user.id if user else None, name=body.name, props=props))
        db.commit()
    return {"ok": True}


@router.get("/health")
def health():
    return {"status": "ok", "service": "picpac-api"}
