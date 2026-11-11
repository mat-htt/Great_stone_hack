"""Журнал операций: пользователь, время, действие, объект, результат (ОТ-04)."""
from __future__ import annotations

from typing import Any, Optional

from fastapi import Request
from sqlalchemy.orm import Session

from .models import AuditLog, User


def audit(
    db: Session,
    user: Optional[User],
    action: str,
    object_type: str = "",
    object_id: Any = "",
    result: str = "ok",
    details: Optional[dict[str, Any]] = None,
    request: Optional[Request] = None,
) -> None:
    label = "anonymous"
    if user is not None:
        label = user.email or f"guest#{user.id}"
    ip = ""
    if request is not None and request.client:
        ip = request.client.host
    db.add(AuditLog(
        user_id=user.id if user else None,
        user_label=label,
        role=user.role if user else "-",
        action=action,
        object_type=object_type,
        object_id=str(object_id),
        result=result,
        details=details or {},
        ip=ip,
    ))
