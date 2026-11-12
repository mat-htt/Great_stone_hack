"""Админка: «Пульс» розницы, заказы и модерация, поддержка, AI-шлюз, аудит, решения."""
from __future__ import annotations

import base64
import io
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, Request
from PIL import Image
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import simulator
from ..ai import engine as ai
from ..ai.providers import masked, ping
from ..ai.registry import IMAGE, TOOLS, tool_public
from ..audit import audit
from ..config import RETOUCHER_RATE_BYN_HOUR
from ..db import get_db, utcnow
from ..errors import ApiError
from ..models import (AIJob, AIProvider, AIToolSetting, AnalyticsEvent, AuditLog, Decision, Order, Product,
                      PromoCode, SupportTicket, User)
from ..security import require_role
from ..seed import gallery
from ..services import STATUS_LABEL, next_step, order_public, set_status
from .orders import ticket_public

router = APIRouter(prefix="/api/admin", tags=["admin"])
operator = require_role("operator")
admin = require_role("admin")

WEEKLY_CAPACITY = 14  # мощность пилотной розничной линии, заказов/нед (тестовое допущение)
TARGETS = {"on_time": 95.0, "defect": 2.5, "sla": 90.0, "margin": 50.0, "conversion": 10.0, "load": 90.0}


def _pct(a: float, b: float) -> float:
    return round(100.0 * a / b, 1) if b else 0.0


def _status(value: float, target: float, higher_is_better: bool = True) -> str:
    if higher_is_better:
        return "green" if value >= target else ("yellow" if value >= target * 0.93 else "red")
    return "green" if value <= target else ("yellow" if value <= target * 1.25 else "red")


def _period_orders(db: Session, start: datetime, end: datetime, product: Optional[str], channel: Optional[str]):
    q = db.query(Order).filter(Order.created_at >= start, Order.created_at < end)
    if product:
        q = q.filter(Order.product_id == product)
    if channel:
        q = q.filter(Order.channel == channel)
    return q.all()


def _kpis(db: Session, start: datetime, end: datetime, product: Optional[str], channel: Optional[str]) -> dict:
    orders = _period_orders(db, start, end, product, channel)
    valid = [o for o in orders if o.status != "cancelled"]
    revenue = sum(o.total_minor for o in valid)
    cost = sum(o.cost_minor for o in valid)
    completed = [o for o in valid if o.status == "completed" and o.on_time is not None]
    on_time = _pct(sum(1 for o in completed if o.on_time), len(completed))
    defect = _pct(sum(1 for o in valid if o.defect), len(valid))
    clients = {o.user_id for o in valid}
    year_ago = end - timedelta(days=365)
    hist = Counter(uid for (uid,) in db.query(Order.user_id).filter(Order.created_at >= year_ago,
                                                                    Order.created_at < end).all())
    repeat = _pct(sum(1 for c in clients if hist.get(c, 0) >= 2), len(clients))
    new_clients = db.query(User).filter(User.created_at >= start, User.created_at < end, User.is_guest.is_(False),
                                        User.role == "client").count()
    tickets = db.query(SupportTicket).filter(SupportTicket.created_at >= start, SupportTicket.created_at < end).all()
    answered = [t for t in tickets if t.first_response_at]
    sla = _pct(sum(1 for t in answered if t.first_response_at <= t.sla_due), len(answered))
    frt = round(sum((t.first_response_at - t.created_at).total_seconds() / 60 for t in answered) / len(answered)) \
        if answered else 0
    sessions = defaultdict(set)
    for name, sess in db.query(AnalyticsEvent.name, AnalyticsEvent.session).filter(
            AnalyticsEvent.created_at >= start, AnalyticsEvent.created_at < end).all():
        sessions[name].add(sess)
    conversion = _pct(len(sessions["order_created"]), len(sessions["app_open"]))
    days = max(1, (end - start).days)
    load = _pct(len(valid) / days * 7, WEEKLY_CAPACITY)
    jobs = db.query(AIJob).filter(AIJob.created_at >= start, AIJob.created_at < end).all()
    saved_h = round(sum(j.saved_minutes for j in jobs) / 60, 1)
    upd = utcnow().isoformat()

    def k(id_, title, value, unit, formula, source, status=None, target=None, fmt="num"):
        return {"id": id_, "title": title, "value": value, "unit": unit, "formula": formula, "source": source,
                "status": status, "target": target, "updated_at": upd, "format": fmt}

    return {
        "revenue": k("revenue", "Оборот", revenue, "BYN", "Σ total заказов (без отменённых)", "Заказы (ERP)",
                     fmt="money"),
        "orders": k("orders", "Заказы", len(valid), "шт", "count(заказы без отменённых)", "Заказы (ERP)"),
        "avg_check": k("avg_check", "Средний чек", round(revenue / len(valid)) if valid else 0, "BYN",
                       "Оборот / Заказы", "Заказы (ERP)", fmt="money"),
        "margin": k("margin", "Валовая маржа", _pct(revenue - cost, revenue), "%", "(Оборот − Себестоимость) / Оборот",
                    "Заказы + 1С (себестоимость)", _status(_pct(revenue - cost, revenue), TARGETS["margin"]),
                    TARGETS["margin"]),
        "on_time": k("on_time", "Заказы в срок", on_time, "%", "завершённые в ETA / все завершённые",
                     "Заказы + доставка", _status(on_time, TARGETS["on_time"]), TARGETS["on_time"]),
        "defect": k("defect", "Брак / перепечатка", defect, "%", "заказы с браком / заказы", "ОТК производства",
                    _status(defect, TARGETS["defect"], False), TARGETS["defect"]),
        "new_clients": k("new_clients", "Новые клиенты", new_clients, "чел", "регистрации за период", "CRM"),
        "active_clients": k("active_clients", "Активные клиенты", len(clients), "чел",
                            "уникальные клиенты с заказом", "CRM + Заказы"),
        "repeat": k("repeat", "Повторные покупки", repeat, "%", "клиенты с ≥2 заказами за 365 дн / активные",
                    "CRM + Заказы"),
        "sla": k("sla", "SLA поддержки", sla, "%", "первый ответ ≤ 4 ч / обращения с ответом", "CRM / поддержка",
                 _status(sla, TARGETS["sla"]), TARGETS["sla"]),
        "frt": k("frt", "Первый ответ", frt, "мин", "среднее (первый ответ − создание)", "CRM / поддержка"),
        "conversion": k("conversion", "Конверсия приложения", conversion, "%",
                        "сессии с заказом / сессии с открытием", "Аналитика приложения",
                        _status(conversion, TARGETS["conversion"]), TARGETS["conversion"]),
        "load": k("load", "Загрузка мощности", load, "%", f"заказов в неделю / {WEEKLY_CAPACITY} (мощность линии)",
                  "ERP (производство)", _status(load, TARGETS["load"], False), TARGETS["load"]),
        "ai_saved": k("ai_saved", "Сэкономлено AI", saved_h, "ч",
                      "Σ норматив ручной ретуши по выполненным AI-операциям", "AI-шлюз picPac"),
        "ai_saved_byn": k("ai_saved_byn", "Экономия на ретуши", round(saved_h * RETOUCHER_RATE_BYN_HOUR * 100),
                          "BYN", f"часы × {RETOUCHER_RATE_BYN_HOUR} BYN/ч (ставка ретушёра)", "AI-шлюз picPac",
                          fmt="money"),
    }


@router.get("/overview")
def overview(days: int = 30, product: Optional[str] = None, channel: Optional[str] = None,
             user: User = Depends(operator), db: Session = Depends(get_db)):
    days = max(7, min(365, days))
    end = utcnow()
    start = end - timedelta(days=days)
    kpis = _kpis(db, start, end, product, channel)
    prev = _kpis(db, start - timedelta(days=days), start, product, channel)
    for key, val in kpis.items():
        pv = prev[key]["value"]
        val["prev"] = pv
        val["delta"] = round((val["value"] - pv) / pv * 100, 1) if pv else None

    orders = _period_orders(db, start, end, product, channel)
    by_day: dict[str, dict[str, int]] = {}
    for i in range(days + 1):
        d = (start + timedelta(days=i)).date().isoformat()
        by_day[d] = {"revenue": 0, "orders": 0}
    for o in orders:
        if o.status == "cancelled":
            continue
        d = o.created_at.date().isoformat()
        if d in by_day:
            by_day[d]["revenue"] += o.total_minor
            by_day[d]["orders"] += 1
    series = [{"date": d, **v} for d, v in by_day.items()]

    names = {p.id: p.title for p in db.query(Product).all()}
    prod_split = Counter()
    chan_split = Counter()
    for o in orders:
        if o.status != "cancelled":
            prod_split[names.get(o.product_id, o.product_id)] += o.total_minor
            chan_split[o.channel] += 1

    steps = [("app_open", "Открыли приложение"), ("product_view", "Смотрели продукт"),
             ("project_created", "Создали проект"), ("photos_added", "Добавили фото"),
             ("preflight_passed", "Прошли проверку Робота"), ("checkout_started", "Начали оформление"),
             ("order_created", "Оформили заказ")]
    sess = defaultdict(set)
    for name, s in db.query(AnalyticsEvent.name, AnalyticsEvent.session).filter(
            AnalyticsEvent.created_at >= start).all():
        sess[name].add(s)
    funnel = [{"id": k, "title": t, "value": len(sess[k])} for k, t in steps]

    queue = Counter()
    for st, sg in db.query(Order.status, Order.stage).filter(Order.status.in_(
            ["accepted", "moderation", "production", "shipped", "needs_fix"])).all():
        queue[sg if st == "production" and sg else st] += 1
    labels = {"accepted": "Приняты", "moderation": "Модерация", "needs_fix": "Нужна правка", "print": "Печать",
              "lamination": "Ламинация", "binding": "Переплёт", "qc": "ОТК", "shipped": "В доставке"}
    queue_out = [{"id": k, "title": labels[k], "value": queue.get(k, 0)} for k in labels]

    forecast = _forecast(db, end)
    alerts = [{"kpi": k, "title": v["title"], "value": v["value"], "unit": v["unit"], "target": v["target"],
               "message": f"{v['title']}: {v['value']}{v['unit']} при цели {v['target']}{v['unit']}"}
              for k, v in kpis.items() if v.get("status") == "red"]
    deficit = next((w for w in forecast if w["deficit"] > 0), None)
    if deficit:
        alerts.append({"kpi": "capacity", "title": "Ожидается дефицит мощности", "value": deficit["forecast"],
                       "unit": "заказов", "target": WEEKLY_CAPACITY,
                       "message": f"Неделя {deficit['week']}: прогноз {deficit['forecast']} при мощности "
                                  f"{WEEKLY_CAPACITY} — дефицит {deficit['deficit']}"})
    return {"period": {"start": start.isoformat(), "end": end.isoformat(), "days": days},
            "kpis": kpis, "series": series,
            "products": [{"title": k, "value": v} for k, v in prod_split.most_common()],
            "channels": [{"title": k, "value": v} for k, v in chan_split.most_common()],
            "funnel": funnel, "queue": queue_out, "forecast": forecast, "alerts": alerts,
            "sources": _sources(db)}


def _forecast(db: Session, now: datetime) -> list[dict[str, Any]]:
    """Сезонный наивный прогноз: тот же период год назад × тренд последних 8 недель."""
    def count(a: datetime, b: datetime) -> int:
        return db.query(Order).filter(Order.created_at >= a, Order.created_at < b, Order.status != "cancelled").count()

    recent = count(now - timedelta(weeks=8), now)
    last_year = count(now - timedelta(weeks=60), now - timedelta(weeks=52))
    trend = recent / last_year if last_year else 1.0
    trend = max(0.6, min(1.8, trend))
    out = []
    for w in range(1, 5):
        a = now + timedelta(weeks=w - 1)
        b = a + timedelta(weeks=1)
        base = count(a - timedelta(weeks=52), b - timedelta(weeks=52))
        fc = round(base * trend)
        out.append({"week": f"{a:%d.%m}–{b:%d.%m}", "forecast": fc, "capacity": WEEKLY_CAPACITY,
                    "deficit": max(0, fc - WEEKLY_CAPACITY), "basis_last_year": base, "trend": round(trend, 2)})
    return out


def _sources(db: Session) -> list[dict[str, Any]]:
    last_order = db.query(func.max(Order.created_at)).scalar()
    last_ticket = db.query(func.max(SupportTicket.created_at)).scalar()
    last_event = db.query(func.max(AnalyticsEvent.created_at)).scalar()
    last_ai = db.query(func.max(AIJob.created_at)).scalar()
    dup = db.query(Order.number).group_by(Order.number).having(func.count() > 1).count()
    return [
        {"id": "erp", "title": "Заказы (ERP, mock)", "rows": db.query(Order).count(),
         "fresh_at": last_order.isoformat() if last_order else None, "duplicates": dup},
        {"id": "crm", "title": "CRM / поддержка (mock)", "rows": db.query(SupportTicket).count(),
         "fresh_at": last_ticket.isoformat() if last_ticket else None, "duplicates": 0},
        {"id": "app", "title": "Аналитика приложения", "rows": db.query(AnalyticsEvent).count(),
         "fresh_at": last_event.isoformat() if last_event else None, "duplicates": 0},
        {"id": "ai", "title": "AI-шлюз", "rows": db.query(AIJob).count(),
         "fresh_at": last_ai.isoformat() if last_ai else None, "duplicates": 0},
    ]


# ---------- Заказы и модерация ----------

@router.get("/orders")
def orders(status: Optional[str] = None, q: Optional[str] = None, only_app: bool = False, limit: int = 60,
           user: User = Depends(operator), db: Session = Depends(get_db)):
    query = db.query(Order)
    if status:
        query = query.filter(Order.status == status)
    if q:
        query = query.filter(Order.number.ilike(f"%{q.strip()}%"))
    if only_app:
        query = query.filter(Order.channel == "app")
    items = query.order_by(Order.created_at.desc()).limit(min(limit, 200)).all()
    users = {u.id: u for u in db.query(User).filter(User.id.in_({o.user_id for o in items})).all()} if items else {}
    counts = Counter(s for (s,) in db.query(Order.status).all())
    return {"items": [order_public(o, with_events=False) | {
        "customer": (users.get(o.user_id).name if users.get(o.user_id) else "—"), "channel": o.channel}
        for o in items], "counts": counts}


@router.get("/orders/{order_id}")
def order_detail(order_id: int, user: User = Depends(operator), db: Session = Depends(get_db)):
    o = db.get(Order, order_id)
    if not o:
        raise ApiError(404, "order_not_found", "Заказ не найден")
    tickets = db.query(SupportTicket).filter_by(order_id=o.id).all()
    return order_public(o) | {"tickets": [ticket_public(t) for t in tickets]}


class StatusIn(BaseModel):
    status: Optional[str] = None
    stage: Optional[str] = None
    message: str = Field(default="", max_length=300)


@router.post("/orders/{order_id}/advance")
def advance(order_id: int, body: StatusIn, request: Request, user: User = Depends(operator),
            db: Session = Depends(get_db)):
    o = db.get(Order, order_id)
    if not o:
        raise ApiError(404, "order_not_found", "Заказ не найден")
    if body.status:
        if body.status not in STATUS_LABEL:
            raise ApiError(422, "bad_status", "Неизвестный статус")
        if body.status == "needs_fix" and not body.message.strip():
            raise ApiError(422, "message_required", "Опишите, что нужно поправить клиенту")
        status, stage = body.status, body.stage if body.status == "production" else None
    else:
        nxt = next_step(o)
        if not nxt:
            raise ApiError(409, "final_status", "Заказ уже в финальном статусе")
        status, stage = nxt
    before = o.status
    set_status(db, o, status, stage, user.email or "operator", body.message)
    audit(db, user, "order_status", "order", o.number, details={"from": before, "to": status, "stage": stage},
          request=request)
    db.commit()
    return order_public(o)


# ---------- Поддержка ----------

@router.get("/tickets")
def tickets(status: Optional[str] = None, user: User = Depends(operator), db: Session = Depends(get_db)):
    q = db.query(SupportTicket)
    if status:
        q = q.filter(SupportTicket.status == status)
    items = q.order_by(SupportTicket.created_at.desc()).limit(80).all()
    now = utcnow()
    out = []
    for t in items:
        d = ticket_public(t)
        d["overdue"] = t.status == "open" and t.sla_due < now
        o = db.get(Order, t.order_id) if t.order_id else None
        d["order_number"] = o.number if o else None
        out.append(d)
    return {"items": out, "open": db.query(SupportTicket).filter_by(status="open").count()}


@router.post("/tickets/{ticket_id}/draft")
def draft_reply(ticket_id: int, request: Request, user: User = Depends(operator), db: Session = Depends(get_db)):
    """AI-черновик ответа. Отправляет только оператор после просмотра (human-in-the-loop)."""
    t = db.get(SupportTicket, ticket_id)
    if not t:
        raise ApiError(404, "ticket_not_found", "Обращение не найдено")
    o = db.get(Order, t.order_id) if t.order_id else None
    payload = {"topic": t.topic, "messages": [{"from": m.author_role, "text": m.text} for m in t.messages][-6:],
               "order": ({"number": o.number, "status_label": STATUS_LABEL.get(o.status), "eta":
                          o.eta.strftime("%d.%m.%Y") if o.eta else None, "track": o.track_number} if o else None)}
    res = ai.run_text(db, "support_reply", user, payload, str(t.id))
    audit(db, user, "ai_support_draft", "ticket", t.id, details=res.get("_meta", {}), request=request)
    db.commit()
    return res


# ---------- AI-шлюз ----------

def provider_public(p: AIProvider) -> dict[str, Any]:
    import os
    has_key = bool(p.api_key or (p.api_key_env and os.getenv(p.api_key_env)))
    return {"id": p.id, "title": p.title, "kind": p.kind, "base_url": p.base_url, "api_key_masked": masked(p.api_key),
            "api_key_env": p.api_key_env, "has_key": has_key, "default_model": p.default_model,
            "vision_model": p.vision_model, "image_model": p.image_model, "location": p.location,
            "enabled": p.enabled, "notes": p.notes}


@router.get("/ai")
def ai_settings(user: User = Depends(admin), db: Session = Depends(get_db)):
    since = utcnow() - timedelta(days=30)
    jobs = db.query(AIJob).filter(AIJob.created_at >= since).all()
    stats: dict[str, dict[str, Any]] = defaultdict(lambda: {"runs": 0, "ms": 0, "fallback": 0, "errors": 0, "saved": 0.0})
    for j in jobs:
        s = stats[j.tool_id]
        s["runs"] += 1
        s["ms"] += j.duration_ms
        s["fallback"] += j.status == "fallback"
        s["errors"] += j.status == "error"
        s["saved"] += j.saved_minutes
    tools_out = []
    for tool_id in TOOLS:
        st = db.get(AIToolSetting, tool_id)
        s = stats.get(tool_id, {"runs": 0, "ms": 0, "fallback": 0, "errors": 0, "saved": 0.0})
        tools_out.append({**tool_public(tool_id), "setting": {
            "provider_id": st.provider_id, "model": st.model, "enabled": st.enabled,
            "fallback_builtin": st.fallback_builtin, "params": st.params},
            "stats": {"runs": s["runs"], "avg_ms": round(s["ms"] / s["runs"]) if s["runs"] else 0,
                      "fallback": s["fallback"], "errors": s["errors"], "saved_hours": round(s["saved"] / 60, 1)}})
    total_saved = sum(j.saved_minutes for j in jobs) / 60
    recent = db.query(AIJob).order_by(AIJob.id.desc()).limit(25).all()
    return {"providers": [provider_public(p) for p in db.query(AIProvider).all()], "tools": tools_out,
            "summary": {"runs": len(jobs), "saved_hours": round(total_saved, 1),
                        "saved_byn": round(total_saved * RETOUCHER_RATE_BYN_HOUR, 2),
                        "fte": round(total_saved / 168, 2), "rate": RETOUCHER_RATE_BYN_HOUR},
            "recent": [{"id": j.id, "tool_id": j.tool_id, "provider_id": j.provider_id, "model": j.model,
                        "status": j.status, "duration_ms": j.duration_ms, "error": j.error,
                        "created_at": j.created_at.isoformat()} for j in recent]}


class ProviderIn(BaseModel):
    id: Optional[str] = Field(default=None, pattern=r"^[a-z0-9_\-]{2,40}$")
    title: Optional[str] = None
    kind: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    api_key_env: Optional[str] = None
    default_model: Optional[str] = None
    vision_model: Optional[str] = None
    image_model: Optional[str] = None
    location: Optional[str] = None
    enabled: Optional[bool] = None
    notes: Optional[str] = None


@router.post("/ai/providers")
def create_provider(body: ProviderIn, request: Request, user: User = Depends(admin), db: Session = Depends(get_db)):
    if not body.id or not body.title or body.kind not in ("openai", "http_image"):
        raise ApiError(422, "bad_provider", "Укажите id, название и тип (openai или http_image)")
    if db.get(AIProvider, body.id):
        raise ApiError(409, "exists", "Провайдер с таким id уже есть")
    p = AIProvider(id=body.id, title=body.title, kind=body.kind)
    db.add(p)
    _update_provider(p, body)
    audit(db, user, "ai_provider_create", "ai_provider", p.id, request=request)
    db.commit()
    return provider_public(p)


def _update_provider(p: AIProvider, body: ProviderIn) -> None:
    for field in ("title", "base_url", "api_key_env", "default_model", "vision_model", "image_model", "location",
                  "enabled", "notes"):
        v = getattr(body, field)
        if v is not None:
            setattr(p, field, v.strip() if isinstance(v, str) else v)
    if body.api_key is not None:  # пустая строка — удалить ключ
        p.api_key = body.api_key.strip()


@router.put("/ai/providers/{provider_id}")
def update_provider(provider_id: str, body: ProviderIn, request: Request, user: User = Depends(admin),
                    db: Session = Depends(get_db)):
    p = db.get(AIProvider, provider_id)
    if not p:
        raise ApiError(404, "not_found", "Провайдер не найден")
    if p.kind == "builtin" and body.enabled is False:
        raise ApiError(409, "builtin_required", "Встроенный движок — страховочный фолбэк, его нельзя выключить")
    _update_provider(p, body)
    audit(db, user, "ai_provider_update", "ai_provider", p.id,
          details={"fields": [k for k, v in body.model_dump().items() if v is not None and k != "api_key"],
                   "api_key_changed": body.api_key is not None}, request=request)
    db.commit()
    return provider_public(p)


@router.post("/ai/providers/{provider_id}/test")
def test_provider(provider_id: str, request: Request, user: User = Depends(admin), db: Session = Depends(get_db)):
    p = db.get(AIProvider, provider_id)
    if not p:
        raise ApiError(404, "not_found", "Провайдер не найден")
    res = ping(p)
    audit(db, user, "ai_provider_test", "ai_provider", p.id, result="ok" if res["ok"] else "error", request=request)
    db.commit()
    return res


class ToolSettingIn(BaseModel):
    provider_id: Optional[str] = None
    model: Optional[str] = None
    enabled: Optional[bool] = None
    fallback_builtin: Optional[bool] = None
    params: Optional[dict[str, Any]] = None


@router.put("/ai/tools/{tool_id}")
def update_tool(tool_id: str, body: ToolSettingIn, request: Request, user: User = Depends(admin),
                db: Session = Depends(get_db)):
    if tool_id not in TOOLS:
        raise ApiError(404, "unknown_tool", "Неизвестный инструмент")
    st = db.get(AIToolSetting, tool_id)
    before = {"provider_id": st.provider_id, "model": st.model, "enabled": st.enabled}
    if body.provider_id is not None:
        p = db.get(AIProvider, body.provider_id)
        if not p:
            raise ApiError(404, "not_found", "Провайдер не найден")
        if p.kind not in TOOLS[tool_id]["kinds"]:
            raise ApiError(422, "incompatible", f"«{p.title}» не поддерживает инструмент «{TOOLS[tool_id]['title']}»")
        st.provider_id = p.id
    for field in ("model", "enabled", "fallback_builtin", "params"):
        v = getattr(body, field)
        if v is not None:
            setattr(st, field, v)
    audit(db, user, "ai_tool_update", "ai_tool", tool_id, details={"before": before, "after": {
        "provider_id": st.provider_id, "model": st.model, "enabled": st.enabled}}, request=request)
    db.commit()
    return {"ok": True}


class BenchIn(BaseModel):
    tool: str
    file: Optional[str] = None
    params: dict[str, Any] = {}


@router.post("/ai/benchmark")
def benchmark(body: BenchIn, user: User = Depends(admin), db: Session = Depends(get_db)):
    """Песочница: прогнать инструмент на тестовом кадре с текущим провайдером и сравнить «до/после»."""
    if body.tool not in TOOLS or TOOLS[body.tool]["type"] != IMAGE:
        raise ApiError(422, "bad_tool", "Выберите инструмент обработки изображений")
    items = gallery.generate()
    name = body.file or next((i["file"] for i in items if i.get("flaw") == "blur"), items[0]["file"])
    img = Image.open(gallery.gallery_path(name)).convert("RGB")
    img.thumbnail((1100, 1100))
    out, meta = ai.run_image(db, body.tool, img, body.params, user, name)
    db.commit()

    def b64(im: Image.Image) -> str:
        buf = io.BytesIO()
        im.convert("RGB").save(buf, "JPEG", quality=82)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

    return {"before": b64(img), "after": b64(out), "meta": meta, "file": name}


# ---------- Решения (мост к треку 1) ----------

class DecisionIn(BaseModel):
    kpi: str = Field(max_length=60)
    problem: str = Field(min_length=3, max_length=300)
    impact: str = Field(default="", max_length=300)
    cause: str = Field(default="", max_length=300)
    action: str = Field(default="", max_length=300)
    owner: str = Field(default="", max_length=120)
    due: Optional[datetime] = None
    priority: str = "high"
    status: str = "new"


def decision_public(d: Decision) -> dict:
    return {"id": d.id, "kpi": d.kpi, "problem": d.problem, "impact": d.impact, "cause": d.cause,
            "action": d.action, "owner": d.owner, "due": d.due.isoformat() if d.due else None,
            "priority": d.priority, "status": d.status, "history": d.history, "created_at": d.created_at.isoformat()}


@router.get("/decisions")
def decisions(user: User = Depends(operator), db: Session = Depends(get_db)):
    return {"items": [decision_public(d) for d in db.query(Decision).order_by(Decision.id.desc()).all()]}


@router.post("/decisions")
def create_decision(body: DecisionIn, request: Request, user: User = Depends(operator), db: Session = Depends(get_db)):
    d = Decision(**body.model_dump(), history=[{"at": utcnow().isoformat(), "by": user.email, "change": "Создано"}])
    db.add(d)
    db.flush()
    audit(db, user, "decision_create", "decision", d.id, request=request)
    db.commit()
    return decision_public(d)


@router.put("/decisions/{decision_id}")
def update_decision(decision_id: int, body: DecisionIn, request: Request, user: User = Depends(operator),
                    db: Session = Depends(get_db)):
    d = db.get(Decision, decision_id)
    if not d:
        raise ApiError(404, "not_found", "Решение не найдено")
    changes = []
    for k, v in body.model_dump().items():
        if getattr(d, k) != v:
            changes.append(k)
            setattr(d, k, v)
    d.history = list(d.history) + [{"at": utcnow().isoformat(), "by": user.email,
                                    "change": "Изменено: " + ", ".join(changes) if changes else "Без изменений"}]
    audit(db, user, "decision_update", "decision", d.id, details={"changes": changes}, request=request)
    db.commit()
    return decision_public(d)


# ---------- Аудит, пользователи, каталог, демо ----------

@router.get("/audit")
def audit_log(action: Optional[str] = None, result: Optional[str] = None, limit: int = 120,
              user: User = Depends(admin), db: Session = Depends(get_db)):
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action.ilike(f"%{action}%"))
    if result:
        q = q.filter(AuditLog.result == result)
    items = q.order_by(AuditLog.id.desc()).limit(min(limit, 500)).all()
    return {"items": [{"id": a.id, "user": a.user_label, "role": a.role, "action": a.action,
                       "object": f"{a.object_type}:{a.object_id}", "result": a.result, "details": a.details,
                       "ip": a.ip, "created_at": a.created_at.isoformat()} for a in items]}


@router.get("/catalog")
def admin_catalog(user: User = Depends(admin), db: Session = Depends(get_db)):
    return {"products": [{"id": p.id, "title": p.title, "base_price_minor": p.base_price_minor, "active": p.active,
                          "production_days": p.production_days, "kind": p.kind}
                         for p in db.query(Product).order_by(Product.sort).all()],
            "promos": [{"code": c.code, "kind": c.kind, "value": c.value, "active": c.active,
                        "description": c.description} for c in db.query(PromoCode).all()]}


class ProductPatch(BaseModel):
    base_price_minor: Optional[int] = Field(default=None, ge=1, le=10_000_000)
    active: Optional[bool] = None
    production_days: Optional[int] = Field(default=None, ge=1, le=30)


@router.put("/catalog/{product_id}")
def patch_product(product_id: str, body: ProductPatch, request: Request, user: User = Depends(admin),
                  db: Session = Depends(get_db)):
    p = db.get(Product, product_id)
    if not p:
        raise ApiError(404, "not_found", "Продукт не найден")
    for k, v in body.model_dump().items():
        if v is not None:
            setattr(p, k, v)
    audit(db, user, "product_update", "product", p.id, details=body.model_dump(exclude_none=True), request=request)
    db.commit()
    return {"ok": True}


@router.get("/users")
def users(user: User = Depends(admin), db: Session = Depends(get_db)):
    items = db.query(User).filter(User.is_synthetic.is_(False)).order_by(User.id.desc()).limit(100).all()
    return {"items": [{"id": u.id, "email": u.email, "name": u.name, "role": u.role, "is_guest": u.is_guest,
                       "deleted": bool(u.deleted_at), "created_at": u.created_at.isoformat()} for u in items],
            "synthetic": db.query(User).filter_by(is_synthetic=True).count()}


class SimIn(BaseModel):
    enabled: bool
    interval: int = Field(default=20, ge=5, le=600)


@router.get("/simulator")
def sim_state(user: User = Depends(operator)):
    return simulator.state()


@router.put("/simulator")
def sim_set(body: SimIn, request: Request, user: User = Depends(admin), db: Session = Depends(get_db)):
    simulator.configure(body.enabled, body.interval)
    audit(db, user, "simulator_update", "simulator", "-", details=body.model_dump(), request=request)
    db.commit()
    return simulator.state()


# ---------- Снимки изделий для каталога (рендер 3D-моделей) ----------
from fastapi import File, UploadFile  # noqa: E402

from ..config import MEDIA_DIR  # noqa: E402


@router.post("/product-shots/{product_id}")
async def product_shot(product_id: str, request: Request, file: UploadFile = File(...), user: User = Depends(admin),
                       db: Session = Depends(get_db)):
    """Администратор обновляет фото изделия для каталога: студийный кадр 3D-модели (страница /dev/shots)."""
    if not db.get(Product, product_id):
        raise ApiError(404, "product_not_found", "Нет такого продукта")
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise ApiError(413, "too_large", "Файл больше 8 МБ")
    img = Image.open(io.BytesIO(data)).convert("RGB")
    img.thumbnail((1000, 1000), Image.Resampling.LANCZOS)
    out = MEDIA_DIR / "product-shots"
    out.mkdir(parents=True, exist_ok=True)
    img.save(out / f"{product_id}.webp", "WEBP", quality=86, method=6)
    audit(db, user, "product_shot", "product", product_id, request=request)
    db.commit()
    return {"ok": True, "size": img.size}
