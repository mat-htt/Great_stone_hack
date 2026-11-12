from __future__ import annotations

import random
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db, utcnow
from ..errors import ApiError
from ..layout import preflight
from ..models import Order, Photo, Product, Project, SupportTicket, TicketMessage, User
from ..pricing import quote
from ..security import current_user
from ..services import add_event, can_access_project, notify, order_public, photo_event

router = APIRouter(prefix="/api", tags=["orders"])


class OrderIn(BaseModel):
    project_id: str
    quantity: int = Field(default=1, ge=1, le=50)
    delivery_method: str = "pickup"
    delivery_address: str = Field(default="", max_length=300)
    promo_code: Optional[str] = None
    accept_warnings: bool = True  # рекомендации Робота необязательны
    payment_method: str = "test_card"


@router.post("/orders")
def create_order(body: OrderIn, request: Request, idempotency_key: Optional[str] = Header(default=None),
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Оформление заказа. Повтор с тем же Idempotency-Key возвращает тот же заказ (МП-05)."""
    if not idempotency_key or len(idempotency_key) < 8:
        raise ApiError(400, "idempotency_required", "Не передан ключ идемпотентности запроса")
    existing = db.query(Order).filter_by(user_id=user.id, idempotency_key=idempotency_key).first()
    if existing:
        audit(db, user, "order_create_replay", "order", existing.number, details={"key": idempotency_key},
              request=request)
        db.commit()
        return {**order_public(existing), "replayed": True}
    project = db.get(Project, body.project_id)
    if not project or not can_access_project(db, user, project):
        raise ApiError(404, "project_not_found", "Проект не найден")
    if project.owner_id != user.id:
        raise ApiError(403, "forbidden", "Оформить заказ может только создатель альбома")
    if project.status != "draft":
        prev = db.query(Order).filter_by(project_id=project.id).first()
        raise ApiError(409, "already_ordered", "Этот проект уже заказан",
                       {"order_id": prev.id if prev else None})
    if body.delivery_method in ("courier", "post", "europost") and len(body.delivery_address.strip()) < 5:
        raise ApiError(422, "address_required", "Укажите адрес доставки")
    product = db.get(Product, project.product_id)
    ids = [s.get("photo_id") for pg in project.layout.get("pages", []) for s in pg.get("slots", []) if s.get("photo_id")]
    photos = {p.id: p for p in db.query(Photo).filter(Photo.id.in_(ids)).all()} if ids else {}
    check = preflight(product, project.options, project.layout, photos)
    if check["critical"]:
        raise ApiError(422, "preflight_failed", "Робот нашёл критичные проблемы — их нужно исправить до заказа",
                       {"preflight": check})
    if check["warnings"] and not body.accept_warnings:
        raise ApiError(422, "warnings_not_accepted", "Есть предупреждения — подтвердите, что заказываете как есть",
                       {"preflight": check})
    pages = len(project.layout.get("pages", []))
    q = quote(db, product, project.options, pages, len(photos), body.quantity, body.delivery_method, body.promo_code)
    if body.promo_code and q.promo_error:
        raise ApiError(422, "bad_promo", q.promo_error)
    now = utcnow()
    order = Order(
        number=f"PP-{now:%y}-{random.randint(100000, 999999)}", user_id=user.id, project_id=project.id,
        product_id=product.id, idempotency_key=idempotency_key, quantity=body.quantity,
        snapshot={"title": project.title, "options": project.options, "pages": pages, "photos": len(photos),
                  "lines": q.lines, "revision": project.revision, "payment": "Тестовая оплата (без списания)",
                  "preflight_score": check["score"], "warnings_accepted": bool(check["warnings"])},
        delivery_method=body.delivery_method, delivery_address=body.delivery_address.strip(),
        promo_code=(q.promo or {}).get("code"), subtotal_minor=q.subtotal_minor, discount_minor=q.discount_minor,
        delivery_minor=q.delivery_minor, total_minor=q.total_minor, status="accepted", channel="app",
        eta=now + timedelta(days=q.production_days + q.delivery_days), cost_minor=int(q.total_minor * 0.44),
        created_at=now, updated_at=now)
    db.add(order)
    try:
        db.flush()
    except IntegrityError:  # гонка двух одинаковых запросов
        db.rollback()
        existing = db.query(Order).filter_by(user_id=user.id, idempotency_key=idempotency_key).first()
        return {**order_public(existing), "replayed": True}
    project.status = "ordered"
    add_event(db, order, "accepted", None, "system")
    for ph in photos.values():
        photo_event(db, ph, "ordered", f"В заказе {order.number}", "user", {"order": order.number}, project_id=project.id,
                    user_id=user.id)
    notify(db, user.id, f"Заказ {order.number} принят", "Я, Робот, уже проверяю файлы. Буду сообщать о каждом этапе.",
           link=f"/orders/{order.id}")
    audit(db, user, "order_create", "order", order.number,
          details={"total_minor": order.total_minor, "currency": order.currency, "key": idempotency_key},
          request=request)
    db.commit()
    return {**order_public(order), "replayed": False}


@router.get("/orders")
def my_orders(user: User = Depends(current_user), db: Session = Depends(get_db)):
    orders = db.query(Order).filter_by(user_id=user.id).order_by(Order.created_at.desc()).all()
    out = []
    for o in orders:
        d = order_public(o, with_events=False)
        d["tickets"] = db.query(SupportTicket).filter_by(order_id=o.id).count()
        out.append(d)
    return {"items": out}


@router.get("/orders/{order_id}")
def get_order(order_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    o = db.get(Order, order_id)
    if not o or (o.user_id != user.id and user.role == "client"):
        raise ApiError(404, "order_not_found", "Заказ не найден")
    d = order_public(o)
    proj = db.get(Project, o.project_id) if o.project_id else None
    d["project"] = {"id": proj.id, "title": proj.title, "cover_photo_id": ((proj.layout or {}).get("cover") or {})
                    .get("photo_id")} if proj else None
    d["tickets"] = [ticket_public(t) for t in db.query(SupportTicket).filter_by(order_id=o.id).all()]
    return d


@router.post("/orders/{order_id}/repeat")
def repeat_order(order_id: int, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Повторная покупка: копия проекта в новый черновик."""
    o = db.get(Order, order_id)
    if not o or o.user_id != user.id or not o.project_id:
        raise ApiError(404, "order_not_found", "Заказ не найден")
    src = db.get(Project, o.project_id)
    copy = Project(owner_id=user.id, product_id=src.product_id, title=src.title + " (копия)",
                   options=dict(src.options), layout=dict(src.layout))
    db.add(copy)
    db.flush()
    for ph in db.query(Photo).filter_by(project_id=src.id).all():
        if ph.owner_id == user.id:
            ph.project_id = copy.id
    audit(db, user, "order_repeat", "project", copy.id, details={"from": o.number}, request=request)
    db.commit()
    return {"project_id": copy.id}


# ---------- Поддержка ----------

def ticket_public(t: SupportTicket) -> dict:
    return {"id": t.id, "order_id": t.order_id, "subject": t.subject, "topic": t.topic, "status": t.status,
            "channel": t.channel, "sla_due": t.sla_due.isoformat(), "created_at": t.created_at.isoformat(),
            "user_id": t.user_id,
            "messages": [{"id": m.id, "author_role": m.author_role, "author_name": m.author_name, "text": m.text,
                          "created_at": m.created_at.isoformat()} for m in t.messages]}


class TicketIn(BaseModel):
    order_id: Optional[int] = None
    topic: str = Field(default="Другое", max_length=40)
    text: str = Field(min_length=2, max_length=2000)


@router.post("/support")
def create_ticket(body: TicketIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.order_id:
        o = db.get(Order, body.order_id)
        if not o or o.user_id != user.id:
            raise ApiError(404, "order_not_found", "Заказ не найден")
    now = utcnow()
    t = SupportTicket(user_id=user.id, order_id=body.order_id, subject=body.text[:120], topic=body.topic,
                      channel="app", status="open", sla_due=now + timedelta(hours=4), created_at=now)
    t.messages.append(TicketMessage(author_role="client", author_name=user.name, text=body.text))
    t.messages.append(TicketMessage(author_role="bot", author_name="Робот",
                                    text="Принял! Оператор ответит в течение 4 часов. Номер обращения появится в "
                                         "истории заказа."))
    db.add(t)
    db.flush()
    audit(db, user, "ticket_create", "ticket", t.id, details={"order_id": body.order_id}, request=request)
    db.commit()
    return ticket_public(t)


@router.get("/support")
def my_tickets(user: User = Depends(current_user), db: Session = Depends(get_db)):
    ts = db.query(SupportTicket).filter_by(user_id=user.id).order_by(SupportTicket.created_at.desc()).all()
    return {"items": [ticket_public(t) for t in ts]}


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@router.post("/support/{ticket_id}/messages")
def add_message(ticket_id: int, body: MessageIn, request: Request, user: User = Depends(current_user),
                db: Session = Depends(get_db)):
    t = db.get(SupportTicket, ticket_id)
    if not t or (t.user_id != user.id and user.role == "client"):
        raise ApiError(404, "ticket_not_found", "Обращение не найдено")
    role = "client" if user.role == "client" else "operator"
    t.messages.append(TicketMessage(author_role=role, author_name=user.name, text=body.text))
    if role == "operator":
        t.status = "answered"
        t.first_response_at = t.first_response_at or utcnow()
        notify(db, t.user_id, "Ответ поддержки", body.text[:160], link=f"/orders/{t.order_id}" if t.order_id else "/support",
               mascot="cat")
    else:
        t.status = "open"
    audit(db, user, "ticket_message", "ticket", t.id, request=request)
    db.commit()
    return ticket_public(t)
