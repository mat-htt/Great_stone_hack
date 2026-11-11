"""Наполнение БД: каталог, тестовые учётные записи, промокоды и синтетические данные для аналитики.

Все данные синтетические (ОТ-03): клиенты обезличены, фото сгенерированы процедурно.
Повторная загрузка: `python -m app.seed.seed --reset`."""
from __future__ import annotations

import argparse
import random
from datetime import datetime, timedelta, timezone

from PIL import Image
from sqlalchemy.orm import Session

from ..ai.engine import ensure_defaults
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

PRODUCTS = [
    dict(id="photobook-premium", title="Фотокнига Премиум", subtitle="Твёрдая обложка · разворот на 180°",
         category="Фотокниги", kind="book", base_price_minor=6900, production_days=1, badge="Хит", accent="#FFD400",
         sort=1, description="Плотные страницы, раскрывается полностью — панорамы без «шва». Печать HP Indigo.",
         specs={"sizes": [{"id": "20x20", "label": "20×20 см", "w_cm": 20, "h_cm": 20, "mult": 1.0},
                          {"id": "30x30", "label": "30×30 см", "w_cm": 30, "h_cm": 30, "mult": 1.45},
                          {"id": "30x20", "label": "30×20 см", "w_cm": 30, "h_cm": 20, "mult": 1.25}],
                "covers": [{"id": "hard", "label": "Твёрдая фото-обложка", "add_minor": 0},
                           {"id": "fabric", "label": "Ткань + тиснение", "add_minor": 1200},
                           {"id": "leather", "label": "Экокожа", "add_minor": 1500}],
                "papers": [{"id": "matte", "label": "Матовая", "add_minor": 0},
                           {"id": "gloss", "label": "Глянцевая", "add_minor": 0},
                           {"id": "silk", "label": "Шёлк lay-flat", "add_minor": 900}],
                "pages": {"min": 20, "max": 80, "step": 2, "included": 20, "extra_spread_minor": 220},
                "photos": {"min": 10, "max": 240},
                "requirements": "JPEG/PNG, от 1500 px по короткой стороне для страницы целиком. Рекомендуется 250 dpi."}),
    dict(id="photobook-lite", title="Фотокнига Лайт", subtitle="Мягкая обложка · быстро и доступно",
         category="Фотокниги", kind="book", base_price_minor=2900, production_days=1, badge="От 29 BYN",
         accent="#FFFFFF", sort=2, description="Лёгкая книга для поездки или подарка. Идеальна для первого заказа.",
         specs={"sizes": [{"id": "15x15", "label": "15×15 см", "w_cm": 15, "h_cm": 15, "mult": 0.8},
                          {"id": "20x20", "label": "20×20 см", "w_cm": 20, "h_cm": 20, "mult": 1.0}],
                "covers": [{"id": "soft", "label": "Мягкая обложка", "add_minor": 0}],
                "papers": [{"id": "matte", "label": "Матовая", "add_minor": 0},
                           {"id": "gloss", "label": "Глянцевая", "add_minor": 0}],
                "pages": {"min": 20, "max": 40, "step": 2, "included": 20, "extra_spread_minor": 150},
                "photos": {"min": 10, "max": 100},
                "requirements": "JPEG/PNG, от 1200 px по короткой стороне."}),
    dict(id="graduation", title="Выпускной альбом", subtitle="Общий альбом класса · «Скинемся»",
         category="Фотокниги", kind="book", base_price_minor=4500, production_days=2, badge="Сезон 2027",
         accent="#FFD400", sort=3,
         description="Каждый загружает свои фото по ссылке, Кот собирает общий альбом, счёт делится на всех.",
         specs={"sizes": [{"id": "21x30", "label": "21×30 см", "w_cm": 21, "h_cm": 30, "mult": 1.0}],
                "covers": [{"id": "hard", "label": "Твёрдая обложка", "add_minor": 0},
                           {"id": "leather", "label": "Экокожа + имя", "add_minor": 1800}],
                "papers": [{"id": "matte", "label": "Матовая", "add_minor": 0}],
                "pages": {"min": 20, "max": 60, "step": 2, "included": 24, "extra_spread_minor": 200},
                "photos": {"min": 15, "max": 300}, "shared": True,
                "requirements": "JPEG/PNG. Портреты — от 1500 px по короткой стороне."}),
    dict(id="prints", title="Фотопечать", subtitle="Классические отпечатки · от 0,45 BYN",
         category="Печать", kind="prints", base_price_minor=45, production_days=1, badge="", accent="#FFFFFF", sort=4,
         description="Настоящая фотобумага, насыщенные цвета. Выберите формат — остальное сделаем мы.",
         specs={"sizes": [{"id": "10x15", "label": "10×15 см", "w_cm": 15, "h_cm": 10, "mult": 1.0},
                          {"id": "15x21", "label": "15×21 см", "w_cm": 21, "h_cm": 15, "mult": 2.4},
                          {"id": "21x30", "label": "21×30 см", "w_cm": 30, "h_cm": 21, "mult": 6.0}],
                "papers": [{"id": "gloss", "label": "Глянец", "add_minor": 0},
                           {"id": "matte", "label": "Мат", "add_minor": 0}],
                "photos": {"min": 1, "max": 400},
                "requirements": "JPEG/PNG. Для 10×15 — от 1200×1800 px."}),
    dict(id="canvas", title="Холст на подрамнике", subtitle="Интерьерная печать",
         category="Интерьер", kind="wall", base_price_minor=4900, production_days=2, badge="", accent="#FFD400", sort=5,
         description="Хлопковый холст, натуральный подрамник. Кадр, который хочется видеть каждый день.",
         specs={"sizes": [{"id": "30x40", "label": "30×40 см", "w_cm": 40, "h_cm": 30, "mult": 1.0},
                          {"id": "40x60", "label": "40×60 см", "w_cm": 60, "h_cm": 40, "mult": 1.6},
                          {"id": "60x90", "label": "60×90 см", "w_cm": 90, "h_cm": 60, "mult": 2.6}],
                "photos": {"min": 1, "max": 1},
                "requirements": "Одно фото. Для 40×60 — от 3500 px по длинной стороне."}),
    dict(id="calendar", title="Настенный календарь 2027", subtitle="12 месяцев ваших фото",
         category="Подарки", kind="calendar", base_price_minor=3500, production_days=1, badge="Новинка",
         accent="#FFFFFF", sort=6, description="Перекидной календарь на пружине. Каждый месяц — новое воспоминание.",
         specs={"sizes": [{"id": "a4", "label": "A4 (21×30)", "w_cm": 30, "h_cm": 21, "mult": 1.0},
                          {"id": "a3", "label": "A3 (30×42)", "w_cm": 42, "h_cm": 30, "mult": 1.5}],
                "photos": {"min": 12, "max": 13},
                "requirements": "12 фото, горизонтальные смотрятся лучше."}),
    dict(id="magnets", title="Фотомагниты", subtitle="Набор на холодильник",
         category="Подарки", kind="prints", base_price_minor=290, production_days=1, badge="", accent="#FFD400", sort=7,
         description="Плотный винил с магнитной основой.",
         specs={"sizes": [{"id": "7x10", "label": "7×10 см", "w_cm": 10, "h_cm": 7, "mult": 1.0}],
                "photos": {"min": 4, "max": 60}, "requirements": "JPEG/PNG, от 800 px."}),
]

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
    for p in PRODUCTS:
        if not db.get(Product, p["id"]):
            db.add(Product(**p))
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
    weights = {"photobook-premium": 5, "photobook-lite": 4, "graduation": 2, "prints": 4, "canvas": 1.5,
               "calendar": 1.2, "magnets": 1}
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
    product = db.get(Product, "photobook-premium")
    sea = [p for p in photos if p.place == "Батуми"]
    picked = curate(sea, 40)["selected"]
    layout = auto_layout(product, {"size": "20x20"}, picked, title="Батуми · Лето 2026")
    draft = Project(owner_id=client.id, product_id=product.id, title="Батуми · Лето 2026",
                    options={"size": "20x20", "cover": "hard", "paper": "matte"}, layout=layout)
    db.add(draft)
    db.flush()
    for p in sea:
        p.project_id = draft.id
    lake = [p for p in photos if p.place == "Нарочь"]
    lite = db.get(Product, "photobook-lite")
    lay2 = auto_layout(lite, {"size": "20x20"}, curate(lake, 30)["selected"], title="Нарочь · Лето 2026")
    ordered = Project(owner_id=client.id, product_id=lite.id, title="Нарочь · Лето 2026", status="ordered",
                      options={"size": "20x20", "cover": "soft", "paper": "matte"}, layout=lay2)
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
