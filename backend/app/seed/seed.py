"""Наполнение БД: каталог, тестовые учётные записи, промокоды и синтетические данные для аналитики.

Все данные синтетические (ОТ-03): клиенты обезличены, фото сгенерированы процедурно.
Повторная загрузка: `python -m app.seed.seed --reset`."""
from __future__ import annotations

import argparse
import json
import random
from datetime import datetime, timedelta, timezone

from PIL import Image
from sqlalchemy.orm import Session

from ..ai.engine import ensure_defaults
from ..config import CONFIG_DATA
from ..db import Base, SessionLocal, engine, utcnow
from ..layout import auto_layout, curate
from ..models import (AnalyticsEvent, Decision, Order, Product, Project, PromoCode, SupportTicket,
                      TicketMessage, User)
from ..pricing import quote
from ..security import hash_password
from ..services import add_event, create_photo, set_status
from . import gallery

TEST_ACCOUNTS = [
    # email, пароль, роль, имя — тестовые значения, только для демо-стенда
    ("client@picpac.test", "demo1234", "client", "Алеся"),
    ("operator@picpac.test", "operator1234", "operator", "Оператор Ксения"),
    ("admin@picpac.test", "admin1234", "admin", "Администратор"),
]

def load_catalog() -> dict:
    return json.loads((CONFIG_DATA / "catalog.json").read_text(encoding="utf-8"))


PROMOS = [
    ("PICPAC10", "percent", 10, 0, "−10% на первый заказ из приложения"),
    ("WELCOME5", "fixed", 500, 2000, "−5 BYN при заказе от 20 BYN"),
    ("FREESHIP", "free_delivery", 0, 0, "Бесплатная доставка"),
    ("SKINEMSYA", "percent", 15, 0, "−15% на общий альбом «Скинемся»"),
]

CHANNELS = ["app", "web", "web", "web", "instagram", "partner"]
REGIONS = ["Минск", "Минск", "Минск", "Гомель", "Брест", "Гродно", "Витебск", "Могилёв"]
SEGMENTS = ["Частный клиент", "Частный клиент", "Частный клиент", "Фотограф", "Школа/сад"]
TOPICS = [("Сроки доставки", "Когда приедет заказ?"), ("Качество печати", "Цвет на фото отличается"),
          ("Оплата", "Не прошла оплата"), ("Макет", "Как поменять обложку?"),
          ("Возврат", "Хочу вернуть заказ"), ("Промокод", "Не работает промокод")]


def _season_weight(d: datetime) -> float:
    m = d.month
    return {4: 2.2, 5: 2.8, 6: 3.0, 7: 2.0, 12: 1.9, 11: 1.3, 8: 1.2}.get(m, 0.9)


def seed_catalog(db: Session) -> None:
    """Каталог — из config_data/catalog.json. Новые продукты добавляются, описания и характеристики
    обновляются; цены и активность, изменённые в админке, сохраняются."""
    cats = {c["id"]: c["name"] for c in load_catalog()["categories"]}
    for p in load_catalog()["products"]:
        data = {**p, "category": p["category"], "accent": "", "specs": p.get("specs", {})}
        cur = db.get(Product, p["id"])
        if not cur:
            db.add(Product(**{k: v for k, v in data.items() if k in Product.__table__.columns}))
        else:
            for k in ("title", "subtitle", "category", "kind", "mockup", "description", "specs", "badge", "sort"):
                setattr(cur, k, data.get(k, getattr(cur, k)))
    _ = cats
    for code, kind, value, min_total, desc in PROMOS:
        if not db.get(PromoCode, code):
            db.add(PromoCode(code=code, kind=kind, value=value, min_total_minor=min_total, description=desc))
    db.commit()


def seed_users(db: Session) -> dict[str, User]:
    out = {}
    for email, pwd, role, name in TEST_ACCOUNTS:
        u = db.query(User).filter_by(email=email).first()
        if not u:
            u = User(email=email, password_hash=hash_password(pwd), role=role, name=name)
            db.add(u)
        out[role] = u
    db.commit()
    return out


def seed_synthetic(db: Session) -> None:
    if db.query(User).filter_by(is_synthetic=True).count():
        return
    rng = random.Random(42)
    now = utcnow()
    customers = []
    for i in range(230):
        created = now - timedelta(days=rng.randint(0, 520))
        customers.append(User(email=f"customer{i:04d}@example.test", name=f"Клиент {i:04d}", role="client",
                              is_synthetic=True, region=rng.choice(REGIONS), segment=rng.choice(SEGMENTS),
                              created_at=created))
    db.add_all(customers)
    db.flush()
    products = {p.id: p for p in db.query(Product).all()}
    weights = {"book-premium": 4, "book-classic": 5, "book-lite": 3, "grad-school-11": 2, "prints-classic": 6,
               "prints-mini": 3, "mug": 2.5, "postcard": 1.5, "calendar-wall": 1.2, "magnets": 1, "canvas": 1,
               "poster": 1, "puzzle": 0.6}
    orders: list[Order] = []
    day = now - timedelta(days=430)
    seq = 1000
    while day < now - timedelta(hours=6):
        n = int(rng.random() * 1.5 * _season_weight(day) + (1 if rng.random() < 0.3 else 0))
        for _ in range(n):
            cust = rng.choice(customers)
            pid = rng.choices(list(weights), weights=list(weights.values()))[0]
            prod = products[pid]
            size = prod.specs["sizes"][rng.randrange(len(prod.specs["sizes"]))]["id"]
            pages = rng.choice([20, 24, 30, 40]) if prod.kind == "book" else 0
            photos = rng.randint(10, 120)
            q = quote(db, prod, {"size": size}, pages, photos, quantity=rng.choice([1, 1, 1, 2]),
                      delivery_method=rng.choice(["pickup", "courier", "post", "europost"]),
                      promo_code=rng.choice([None, None, None, "PICPAC10", "FREESHIP"]))
            created = day + timedelta(hours=rng.uniform(8, 22))
            seq += 1
            eta = created + timedelta(days=prod.production_days + 2)
            age = (now - created).days
            if age > 7:
                status = "completed" if rng.random() > 0.03 else "cancelled"
            elif age > 3:
                status = rng.choice(["shipped", "completed", "completed"])
            elif age > 1:
                status = rng.choice(["production", "shipped"])
            else:
                status = rng.choice(["accepted", "moderation", "production"])
            o = Order(number=f"PP-{created:%y}-{seq:06d}", user_id=cust.id, product_id=pid, quantity=1,
                      snapshot={"title": prod.title, "size": size, "pages": pages, "photos": photos},
                      delivery_method="pickup", subtotal_minor=q.subtotal_minor, discount_minor=q.discount_minor,
                      delivery_minor=q.delivery_minor, total_minor=q.total_minor, status=status,
                      stage=rng.choice(["print", "lamination", "binding", "qc"]) if status == "production" else None,
                      channel=rng.choice(CHANNELS), eta=eta, created_at=created, updated_at=created,
                      defect=rng.random() < 0.021, cost_minor=int(q.total_minor * rng.uniform(0.38, 0.52)))
            if status == "completed":
                late = rng.random() < 0.06
                o.completed_at = eta + timedelta(days=rng.uniform(0.5, 2.5)) if late else eta - timedelta(hours=rng.uniform(1, 30))
                o.on_time = not late
            orders.append(o)
        day += timedelta(days=1)
    db.add_all(orders)
    db.flush()
    for o in orders:
        add_event(db, o, "accepted", None, "system", when=o.created_at)
        if o.status not in ("accepted",):
            add_event(db, o, "moderation", None, "system", when=o.created_at + timedelta(minutes=40))
    # Обращения в поддержку
    for i in range(330):
        o = rng.choice(orders)
        topic, subj = rng.choice(TOPICS)
        created = o.created_at + timedelta(hours=rng.uniform(2, 70))
        if created > now:
            created = now - timedelta(hours=rng.uniform(1, 30))
        first = created + timedelta(minutes=rng.choice([12, 25, 40, 70, 95, 180, 420]))
        open_ = (now - created) < timedelta(days=2) and rng.random() < 0.4
        t = SupportTicket(user_id=o.user_id, order_id=o.id, subject=subj, topic=topic,
                          channel=rng.choice(["app", "web", "telegram", "email", "phone"]),
                          status="open" if open_ else "closed", sla_due=created + timedelta(hours=4),
                          created_at=created, first_response_at=None if open_ else first,
                          resolved_at=None if open_ else first + timedelta(hours=rng.uniform(0.2, 20)))
        t.messages.append(TicketMessage(author_role="client", author_name="Клиент", text=subj, created_at=created))
        db.add(t)
    # Воронка приложения за 45 дней
    for d in range(45):
        base = now - timedelta(days=d)
        for s in range(int(rng.uniform(60, 110) * (1.3 if d < 14 else 1))):
            session = f"s{d}-{s}"
            t0 = base - timedelta(hours=rng.uniform(0, 23))
            steps = ["app_open", "product_view", "project_created", "photos_added", "preflight_passed",
                     "checkout_started", "order_created"]
            keep = [0.98, 0.72, 0.55, 0.85, 0.82, 0.74]
            db.add(AnalyticsEvent(session=session, name=steps[0], created_at=t0))
            for k, step in enumerate(steps[1:]):
                if rng.random() > keep[k]:
                    break
                db.add(AnalyticsEvent(session=session, name=step, created_at=t0 + timedelta(minutes=k * 2 + 1)))
    # История AI-операций за 30 дней (для метрики экономии ретуши)
    from ..config import MANUAL_MINUTES
    from ..models import AIJob
    tools_w = {"auto_enhance": 30, "upscale": 14, "text_clarity": 8, "denoise": 6, "portrait": 9, "restore": 3,
               "style": 12, "smart_extend": 4, "remove_bg": 2, "curate": 10, "layout": 10, "captions": 4, "command": 8}
    for _ in range(1400):
        tool = rng.choices(list(tools_w), weights=list(tools_w.values()))[0]
        status = "fallback" if rng.random() < 0.03 else "ok"
        db.add(AIJob(tool_id=tool, provider_id="builtin", model="picpac-cv-1", status=status,
                     duration_ms=int(rng.uniform(180, 2400)), saved_minutes=MANUAL_MINUTES.get(tool, 2),
                     created_at=now - timedelta(days=rng.uniform(0, 30))))
    db.add(Decision(kpi="sla_support", problem="SLA первой реакции поддержки ниже цели в пик сезона",
                    impact="Повторные обращения +18%, риск оттока выпускных заказов",
                    cause="Рост обращений «Сроки доставки» в мае–июне",
                    action="Включить AI-черновики ответов + автостатусы Робота в приложении",
                    owner="Зам. директора по работе с клиентами", due=now + timedelta(days=10),
                    priority="high", status="in_progress",
                    history=[{"at": now.isoformat(), "by": "admin@picpac.test", "change": "Создано"}]))
    db.commit()


def seed_demo_client(db: Session, client: User) -> None:
    """Демо-клиент уже имеет библиотеку фото, черновик и заказ в производстве."""
    from ..models import Photo
    if db.query(Photo).filter_by(owner_id=client.id).count():
        return
    items = gallery.generate()
    photos = []
    for it in items:
        img = Image.open(gallery.gallery_path(it["file"])).convert("RGB")
        photos.append(create_photo(db, client, img, it["file"], source="gallery",
                                   taken_at=datetime.fromisoformat(it["taken_at"]), place=it["place"]))
    db.flush()
    product = db.get(Product, "book-premium")
    sea = [p for p in photos if p.place == "Батуми"]
    picked = curate(sea, 40)["selected"]
    layout = auto_layout(product, {"size": "20x20"}, picked, title="Батуми · Лето 2026")
    draft = Project(owner_id=client.id, product_id=product.id, title="Батуми · Лето 2026",
                    options={"size": "20x20", "cover": "hard", "paper": "photo", "template": "travel"}, layout=layout)
    db.add(draft)
    db.flush()
    for p in sea:
        p.project_id = draft.id
    lake = [p for p in photos if p.place == "Нарочь"]
    lite = db.get(Product, "book-lite")
    lay2 = auto_layout(lite, {"size": "20x20"}, curate(lake, 30)["selected"], title="Нарочь · Лето 2026")
    ordered = Project(owner_id=client.id, product_id=lite.id, title="Нарочь · Лето 2026", status="ordered",
                      options={"size": "20x20", "cover": "hard", "paper": "matte", "template": "gallery"}, layout=lay2)
    db.add(ordered)
    db.flush()
    q = quote(db, lite, ordered.options, len(lay2["pages"]), len(lake), 1, "courier", "PICPAC10")
    created = utcnow() - timedelta(hours=20)
    o = Order(number=f"PP-{created:%y}-{900001}", user_id=client.id, project_id=ordered.id, product_id=lite.id,
              idempotency_key="seed-demo-1",
              snapshot={"title": ordered.title, "size": "20x20", "pages": len(lay2["pages"]), "photos": len(lake),
                        "options": ordered.options, "lines": q.lines},
              delivery_method="courier", delivery_address="Минск, пр-т Независимости, 1", promo_code="PICPAC10",
              subtotal_minor=q.subtotal_minor, discount_minor=q.discount_minor, delivery_minor=q.delivery_minor,
              total_minor=q.total_minor, status="accepted", created_at=created, updated_at=created,
              eta=created + timedelta(days=2), channel="app")
    db.add(o)
    db.flush()
    add_event(db, o, "accepted", None, "system", when=created)
    for st, sg in (("moderation", None), ("production", "print"), ("production", "lamination")):
        set_status(db, o, st, sg, "system", notify_user=False)
    t = SupportTicket(user_id=client.id, order_id=o.id, subject="Можно успеть к пятнице?", topic="Сроки доставки",
                      channel="app", status="answered", sla_due=created + timedelta(hours=4), created_at=created,
                      first_response_at=created + timedelta(minutes=18))
    t.messages.append(TicketMessage(author_role="client", author_name=client.name,
                                    text="Здравствуйте! Книга нужна в подарок в пятницу — успеете?", created_at=created))
    t.messages.append(TicketMessage(author_role="operator", author_name="Оператор Ксения",
                                    text="Добрый день! Да, заказ уже в производстве, курьер привезёт в четверг.",
                                    created_at=created + timedelta(minutes=18)))
    db.add(t)
    db.commit()


def run(reset: bool = False) -> None:
    if reset:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        seed_catalog(db)
        users = seed_users(db)
        ensure_defaults(db)
        seed_synthetic(db)
        seed_demo_client(db, users["client"])
    finally:
        db.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true", help="пересоздать базу с нуля")
    args = ap.parse_args()
    run(args.reset)
    print("Seed complete")
