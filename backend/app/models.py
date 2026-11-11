"""Модель данных. Совместима с рекомендованным контрактом ТЗ:
user, customer, product, project, order, order_status, interaction (support), metric, alert."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, TZDateTime, utcnow


def uid() -> str:
    return uuid.uuid4().hex


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[Optional[str]] = mapped_column(String(200), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="Гость")
    role: Mapped[str] = mapped_column(String(20), default="client")  # client | operator | admin
    password_hash: Mapped[Optional[str]] = mapped_column(String(300))
    is_guest: Mapped[bool] = mapped_column(Boolean, default=False)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=False)
    region: Mapped[str] = mapped_column(String(40), default="Минск")
    segment: Mapped[str] = mapped_column(String(40), default="Частный клиент")
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(TZDateTime)


class Product(Base):
    __tablename__ = "products"
    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    subtitle: Mapped[str] = mapped_column(String(200), default="")
    category: Mapped[str] = mapped_column(String(40))
    kind: Mapped[str] = mapped_column(String(20), default="book")  # book | prints | wall | calendar
    description: Mapped[str] = mapped_column(Text, default="")
    base_price_minor: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="BYN")
    production_days: Mapped[int] = mapped_column(Integer, default=1)
    specs: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    badge: Mapped[str] = mapped_column(String(40), default="")
    accent: Mapped[str] = mapped_column(String(20), default="#FFD400")
    sort: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Photo(Base):
    __tablename__ = "photos"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[Optional[str]] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), index=True)
    parent_id: Mapped[Optional[str]] = mapped_column(String(32))
    filename: Mapped[str] = mapped_column(String(200))
    path: Mapped[str] = mapped_column(String(300))
    thumb_path: Mapped[str] = mapped_column(String(300))
    mime: Mapped[str] = mapped_column(String(40))
    size_bytes: Mapped[int] = mapped_column(Integer)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    taken_at: Mapped[Optional[datetime]] = mapped_column(TZDateTime)
    place: Mapped[Optional[str]] = mapped_column(String(120))
    phash: Mapped[str] = mapped_column(String(32), default="")
    sharpness: Mapped[float] = mapped_column(Float, default=0)
    brightness: Mapped[float] = mapped_column(Float, default=0)
    faces: Mapped[list[Any]] = mapped_column(JSON, default=list)
    score: Mapped[float] = mapped_column(Float, default=0)
    source: Mapped[str] = mapped_column(String(20), default="upload")  # upload | gallery | ai
    ai_tool: Mapped[Optional[str]] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"))
    title: Mapped[str] = mapped_column(String(160), default="Моя книга")
    options: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    layout: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | ordered
    revision: Mapped[int] = mapped_column(Integer, default=1)
    share_code: Mapped[Optional[str]] = mapped_column(String(16), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    members: Mapped[list["ProjectMember"]] = relationship(cascade="all, delete-orphan")


class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    display_name: Mapped[str] = mapped_column(String(80))
    joined_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)


class PromoCode(Base):
    __tablename__ = "promo_codes"
    code: Mapped[str] = mapped_column(String(30), primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))  # percent | fixed | free_delivery
    value: Mapped[int] = mapped_column(Integer, default=0)  # % или копейки
    min_total_minor: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str] = mapped_column(String(200), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (UniqueConstraint("user_id", "idempotency_key"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    number: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[Optional[str]] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"))
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"))
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(80))
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    delivery_method: Mapped[str] = mapped_column(String(20), default="pickup")
    delivery_address: Mapped[str] = mapped_column(String(300), default="")
    promo_code: Mapped[Optional[str]] = mapped_column(String(30))
    subtotal_minor: Mapped[int] = mapped_column(Integer, default=0)
    discount_minor: Mapped[int] = mapped_column(Integer, default=0)
    delivery_minor: Mapped[int] = mapped_column(Integer, default=0)
    total_minor: Mapped[int] = mapped_column(Integer, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="BYN")
    status: Mapped[str] = mapped_column(String(20), default="accepted", index=True)
    stage: Mapped[Optional[str]] = mapped_column(String(20))
    track_number: Mapped[Optional[str]] = mapped_column(String(40))
    channel: Mapped[str] = mapped_column(String(20), default="app")
    eta: Mapped[Optional[datetime]] = mapped_column(TZDateTime)
    defect: Mapped[bool] = mapped_column(Boolean, default=False)
    on_time: Mapped[Optional[bool]] = mapped_column(Boolean)
    cost_minor: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(TZDateTime)
    events: Mapped[list["OrderEvent"]] = relationship(cascade="all, delete-orphan", order_by="OrderEvent.id")


class OrderEvent(Base):
    __tablename__ = "order_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20))
    stage: Mapped[Optional[str]] = mapped_column(String(20))
    message: Mapped[str] = mapped_column(String(300))
    actor: Mapped[str] = mapped_column(String(80), default="system")
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)


class SupportTicket(Base):
    __tablename__ = "support_tickets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    order_id: Mapped[Optional[int]] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), index=True)
    subject: Mapped[str] = mapped_column(String(200))
    topic: Mapped[str] = mapped_column(String(40), default="Другое")
    channel: Mapped[str] = mapped_column(String(20), default="app")
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | answered | closed
    sla_due: Mapped[datetime] = mapped_column(TZDateTime)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    first_response_at: Mapped[Optional[datetime]] = mapped_column(TZDateTime)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(TZDateTime)
    messages: Mapped[list["TicketMessage"]] = relationship(cascade="all, delete-orphan", order_by="TicketMessage.id")


class TicketMessage(Base):
    __tablename__ = "ticket_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("support_tickets.id", ondelete="CASCADE"), index=True)
    author_role: Mapped[str] = mapped_column(String(20))  # client | operator | bot
    author_name: Mapped[str] = mapped_column(String(80))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(String(400))
    link: Mapped[str] = mapped_column(String(200), default="")
    mascot: Mapped[str] = mapped_column(String(10), default="robot")
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, index=True)
    user_label: Mapped[str] = mapped_column(String(200), default="anonymous")
    role: Mapped[str] = mapped_column(String(20), default="-")
    action: Mapped[str] = mapped_column(String(60), index=True)
    object_type: Mapped[str] = mapped_column(String(40), default="")
    object_id: Mapped[str] = mapped_column(String(60), default="")
    result: Mapped[str] = mapped_column(String(20), default="ok")  # ok | denied | error
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    ip: Mapped[str] = mapped_column(String(60), default="")
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow, index=True)


class AIProvider(Base):
    __tablename__ = "ai_providers"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(20))  # builtin | openai | http_image
    base_url: Mapped[str] = mapped_column(String(300), default="")
    api_key: Mapped[str] = mapped_column(String(300), default="")
    api_key_env: Mapped[str] = mapped_column(String(80), default="")
    default_model: Mapped[str] = mapped_column(String(120), default="")
    vision_model: Mapped[str] = mapped_column(String(120), default="")
    image_model: Mapped[str] = mapped_column(String(120), default="")
    location: Mapped[str] = mapped_column(String(80), default="")  # где обрабатываются данные
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(String(300), default="")


class AIToolSetting(Base):
    __tablename__ = "ai_tool_settings"
    tool_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    provider_id: Mapped[str] = mapped_column(String(40), default="builtin")
    model: Mapped[str] = mapped_column(String(120), default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    fallback_builtin: Mapped[bool] = mapped_column(Boolean, default=True)
    params: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class AIJob(Base):
    __tablename__ = "ai_jobs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tool_id: Mapped[str] = mapped_column(String(40), index=True)
    provider_id: Mapped[str] = mapped_column(String(40))
    model: Mapped[str] = mapped_column(String(120), default="")
    user_id: Mapped[Optional[int]] = mapped_column(Integer)
    object_id: Mapped[str] = mapped_column(String(60), default="")
    status: Mapped[str] = mapped_column(String(20), default="ok")  # ok | fallback | error
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    saved_minutes: Mapped[float] = mapped_column(Float, default=0)
    error: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow, index=True)


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session: Mapped[str] = mapped_column(String(40), index=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(40), index=True)
    props: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow, index=True)


class Decision(Base):
    """Карточка решения по отклонению KPI (мост к треку 1)."""
    __tablename__ = "decisions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kpi: Mapped[str] = mapped_column(String(60))
    problem: Mapped[str] = mapped_column(String(300))
    impact: Mapped[str] = mapped_column(String(300), default="")
    cause: Mapped[str] = mapped_column(String(300), default="")
    action: Mapped[str] = mapped_column(String(300), default="")
    owner: Mapped[str] = mapped_column(String(120), default="")
    due: Mapped[Optional[datetime]] = mapped_column(TZDateTime)
    priority: Mapped[str] = mapped_column(String(10), default="high")
    status: Mapped[str] = mapped_column(String(20), default="new")
    history: Mapped[list[Any]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
