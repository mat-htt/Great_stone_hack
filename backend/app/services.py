"""Общая бизнес-логика: фото, статусы заказа, уведомления, сериализация."""
from __future__ import annotations

import random
from datetime import datetime, timedelta
from typing import Any, Optional

from PIL import Image
from sqlalchemy.orm import Session

from . import imaging
from .db import utcnow
from .models import Notification, Order, OrderEvent, Photo, Project, ProjectMember, User

STATUSES = [
    ("accepted", "Принят"),
    ("moderation", "Модерация"),
    ("production", "Производство"),
    ("shipped", "Передан в доставку"),
    ("completed", "Завершён"),
]
STATUS_LABEL = dict(STATUSES) | {"needs_fix": "Нужна правка", "cancelled": "Отменён"}
STAGES = [("print", "Печать"), ("lamination", "Ламинация"), ("binding", "Переплёт"), ("qc", "ОТК")]
STAGE_LABEL = dict(STAGES)

ROBOT_LINES = {
    "accepted": "Заказ принят. Я уже проверяю файлы!",
    "moderation": "Модератор смотрит макет — обычно это занимает до часа.",
    "print": "Печатаем! Машина HP Indigo уже шуршит вашими страницами.",
    "lamination": "Ламинируем обложку — будет приятная на ощупь.",
    "binding": "Склеиваем и переплетаем. Почти книга!",
    "qc": "ОТК: проверяю каждый разворот на свет. Всё ровно.",
    "shipped": "Передал в доставку. Трек-номер — в карточке заказа.",
    "completed": "Заказ завершён. Надеюсь, книга понравилась! Мур от Кота.",
    "needs_fix": "Модератор нашёл, что поправить. Посмотрите комментарий.",
    "cancelled": "Заказ отменён.",
}


def photo_advice(p: Photo) -> list[dict[str, Any]]:
    """Рекомендации по фото. Всегда необязательные: пользователь может принять или оставить как есть."""
    if p.source == "ai":
        return []
    out: list[dict[str, Any]] = []
    sharp = imaging.sharpness_norm(p.sharpness)
    if sharp < 0.14:
        out.append({"code": "blurry", "who": "robot", "tool": "text_clarity", "params": {},
                    "title": "Кадр немного смазан", "text": "Могу повысить резкость. Если так задумано — оставим."})
    if min(p.width, p.height) < 1400:
        out.append({"code": "lowres", "who": "robot", "tool": "upscale", "params": {"scale": 2 if min(p.width, p.height) > 900 else 4},
                    "title": "Мало пикселей для крупной печати", "text": "Нейросеть увеличит разрешение. Для маленьких форматов можно не трогать."})
    if p.brightness < 55:
        out.append({"code": "dark", "who": "robot", "tool": "auto_enhance", "params": {},
                    "title": "Тёмный кадр", "text": "В печати тени станут глубже. Предлагаю мягко осветлить."})
    if p.faces and sharp >= 0.14 and len(out) == 0:
        out.append({"code": "portrait", "who": "cat", "tool": "portrait", "params": {},
                    "title": "Красивый портрет", "text": "Могу сделать лёгкую ретушь кожи — по желанию."})
    return out


def photo_event(db: Session, photo: Photo | str, kind: str, title: str, actor: str = "system",
                details: Optional[dict[str, Any]] = None, project_id: Optional[str] = None,
                user_id: Optional[int] = None) -> None:
    from .models import PhotoEvent
    if isinstance(photo, str):
        photo = db.get(Photo, photo)
        if photo is None:
            return
    db.add(PhotoEvent(photo_id=photo.id, root_id=photo.parent_id or photo.id, project_id=project_id or photo.project_id,
                      user_id=user_id, kind=kind, actor=actor, title=title[:200], details=details or {}))


def photo_public(p: Photo) -> dict[str, Any]:
    return {
        "advice": photo_advice(p),
        "id": p.id, "filename": p.filename, "width": p.width, "height": p.height, "mime": p.mime,
        "size_bytes": p.size_bytes, "taken_at": p.taken_at.isoformat() if p.taken_at else None, "place": p.place,
        "sharpness": round(imaging.sharpness_norm(p.sharpness), 3), "brightness": p.brightness,
        "faces": p.faces, "score": p.score, "source": p.source, "ai_tool": p.ai_tool, "parent_id": p.parent_id,
        "project_id": p.project_id, "owner_id": p.owner_id,
        "url": f"/api/media/{p.id}", "thumb": f"/api/media/{p.id}?size=thumb",
        "created_at": p.created_at.isoformat(),
    }


def create_photo(db: Session, owner: User, img: Image.Image, filename: str, *, source: str = "upload",
                 taken_at: Optional[datetime] = None, place: Optional[str] = None,
                 project_id: Optional[str] = None, parent_id: Optional[str] = None,
                 ai_tool: Optional[str] = None, mime: str = "image/jpeg") -> Photo:
    info = imaging.analyze(img)
    photo = Photo(owner_id=owner.id, project_id=project_id, parent_id=parent_id, filename=filename[:200],
                  path="", thumb_path="", mime=mime, size_bytes=0, width=img.width, height=img.height,
                  taken_at=taken_at, place=place, phash=info["phash"], sharpness=info["sharpness"],
                  brightness=info["brightness"], faces=info["faces"], source=source, ai_tool=ai_tool,
                  score=imaging.quality_score(img.width, img.height, info["sharpness"], info["brightness"],
                                              info["faces"]))
    db.add(photo)
    db.flush()
    rel, rel_t, size = imaging.save_image(img, owner.id, photo.id)
    photo.path, photo.thumb_path, photo.size_bytes = rel, rel_t, size
    if max(img.size) > imaging.MAX_SIDE:
        photo.width, photo.height = Image.open(imaging.MEDIA_DIR / rel).size
    if source != "ai":
        photo_event(db, photo, "uploaded", f"Загружено: {photo.width}×{photo.height}", "user",
                    {"source": source, "size_bytes": photo.size_bytes}, user_id=owner.id)
        photo_event(db, photo, "analyzed", "Робот проанализировал кадр", "robot",
                    {"sharpness": round(imaging.sharpness_norm(photo.sharpness), 2), "brightness": photo.brightness,
                     "faces": len(photo.faces or []), "face_model": info.get("face_model"), "score": photo.score,
                     "phash": photo.phash})
        for a in photo_advice(photo):
            photo_event(db, photo, "advice", f"{'Кот' if a['who'] == 'cat' else 'Робот'}: {a['title']}", a["who"],
                        {"code": a["code"], "tool": a["tool"], "optional": True})
    return photo


def can_access_project(db: Session, user: User, project: Project) -> bool:
    if user.role in ("operator", "admin") or project.owner_id == user.id:
        return True
    return db.query(ProjectMember).filter_by(project_id=project.id, user_id=user.id).first() is not None


def can_access_photo(db: Session, user: User, photo: Photo) -> bool:
    if user.role in ("operator", "admin") or photo.owner_id == user.id:
        return True
    if photo.project_id:
        project = db.get(Project, photo.project_id)
        return bool(project and can_access_project(db, user, project))
    return False


def notify(db: Session, user_id: int, title: str, body: str, link: str = "", mascot: str = "robot",
           telegram_text: Optional[str] = None) -> None:
    """Уведомление в приложении + копия в Telegram, если клиент подключил бота (иначе ничего не происходит)."""
    db.add(Notification(user_id=user_id, title=title, body=body, link=link, mascot=mascot))
    from . import telegram
    telegram.notify_user(db, user_id, title, telegram_text or body, link)


def _fmt_date(d: Optional[datetime]) -> str:
    if not d:
        return ""
    months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября",
              "ноября", "декабря"]
    local = d + timedelta(hours=3)  # Минск, UTC+3
    return f"{local.day} {months[local.month - 1]}"


def order_telegram_text(order: Order, status: str, stage: Optional[str], message: str) -> str:
    """Текст для бота: этап, что дальше и когда ждать."""
    lines = [message or ROBOT_LINES.get(stage or status, "")]
    eta = _fmt_date(order.eta)
    if status == "production" and eta:
        lines.append(f"Ориентировочно будет готов к {eta}.")
    if status == "shipped":
        if order.delivery_method == "pickup":
            lines = ["Заказ готов к выдаче! 🎉 Заберите его в пункте picPac — назовите номер заказа."]
        else:
            lines = ["Заказ в доставке 🚚" + (f" Ждите {eta}." if eta else "")]
            if order.track_number:
                lines.append(f"Трек-номер: {order.track_number}")
    if status == "needs_fix":
        lines.append("Откройте заказ в приложении, чтобы поправить макет.")
    return "\n".join(x for x in lines if x)


def add_event(db: Session, order: Order, status: str, stage: Optional[str], actor: str, message: str = "",
              when: Optional[datetime] = None) -> None:
    key = stage or status
    db.add(OrderEvent(order_id=order.id, status=status, stage=stage, actor=actor,
                      message=message or ROBOT_LINES.get(key, STATUS_LABEL.get(status, status)),
                      created_at=when or utcnow()))


def next_step(order: Order) -> Optional[tuple[str, Optional[str]]]:
    if order.status in ("completed", "cancelled"):
        return None
    if order.status == "needs_fix":
        return ("moderation", None)
    if order.status == "production":
        idx = [s for s, _ in STAGES].index(order.stage) if order.stage in STAGE_LABEL else -1
        if idx < len(STAGES) - 1:
            return ("production", STAGES[idx + 1][0])
        return ("shipped", None)
    order_ids = [s for s, _ in STATUSES]
    i = order_ids.index(order.status)
    nxt = order_ids[i + 1]
    return (nxt, "print" if nxt == "production" else None)


def set_status(db: Session, order: Order, status: str, stage: Optional[str], actor: str,
               message: str = "", notify_user: bool = True) -> None:
    order.status, order.stage = status, stage
    order.updated_at = utcnow()
    if status == "shipped" and not order.track_number:
        order.track_number = f"BY{random.randint(10**9, 10**10 - 1)}PP"
    if status == "completed":
        order.completed_at = utcnow()
        order.on_time = bool(order.eta and order.completed_at <= order.eta + timedelta(days=1))
    add_event(db, order, status, stage, actor, message)
    if notify_user:
        label = STAGE_LABEL.get(stage) if stage else STATUS_LABEL.get(status)
        notify(db, order.user_id, f"Заказ {order.number}: {label}", message or ROBOT_LINES.get(stage or status, ""),
               link=f"/orders/{order.id}", telegram_text=order_telegram_text(order, status, stage, message))


def order_public(order: Order, with_events: bool = True) -> dict[str, Any]:
    data = {
        "id": order.id, "number": order.number, "status": order.status,
        "status_label": STATUS_LABEL.get(order.status, order.status), "stage": order.stage,
        "stage_label": STAGE_LABEL.get(order.stage) if order.stage else None,
        "product_id": order.product_id, "project_id": order.project_id, "snapshot": order.snapshot,
        "quantity": order.quantity, "delivery_method": order.delivery_method,
        "delivery_address": order.delivery_address, "promo_code": order.promo_code,
        "subtotal_minor": order.subtotal_minor, "discount_minor": order.discount_minor,
        "delivery_minor": order.delivery_minor, "total_minor": order.total_minor, "currency": order.currency,
        "track_number": order.track_number, "eta": order.eta.isoformat() if order.eta else None,
        "created_at": order.created_at.isoformat(), "updated_at": order.updated_at.isoformat(),
        "user_id": order.user_id,
    }
    if with_events:
        data["events"] = [{"status": e.status, "stage": e.stage, "message": e.message, "actor": e.actor,
                           "created_at": e.created_at.isoformat(),
                           "label": STAGE_LABEL.get(e.stage) if e.stage else STATUS_LABEL.get(e.status, e.status)}
                          for e in order.events]
    return data
