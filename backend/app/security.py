"""Аутентификация (JWT) и проверка ролей на серверной стороне (ОТ-02)."""
from __future__ import annotations

import hashlib
import hmac
import os
from datetime import timedelta
from typing import Callable, Optional

import jwt
from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from .config import JWT_SECRET, JWT_TTL_HOURS
from .db import get_db, utcnow
from .errors import ApiError
from .models import User

ROLE_LEVEL = {"client": 0, "operator": 1, "admin": 2}


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return f"pbkdf2${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: Optional[str]) -> bool:
    if not stored or not stored.startswith("pbkdf2$"):
        return False
    _, salt_hex, digest_hex = stored.split("$")
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 200_000)
    return hmac.compare_digest(digest.hex(), digest_hex)


def create_token(user: User) -> str:
    payload = {"sub": str(user.id), "role": user.role, "exp": utcnow() + timedelta(hours=JWT_TTL_HOURS)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _decode(token: str) -> Optional[int]:
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return int(data["sub"])
    except Exception:
        return None


def optional_user(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]
    elif request.query_params.get("token"):  # для <img src> на медиа
        token = request.query_params["token"]
    if not token:
        return None
    user_id = _decode(token)
    if user_id is None:
        return None
    user = db.get(User, user_id)
    if not user or user.deleted_at:
        return None
    request.state.user = user
    return user


def current_user(user: Optional[User] = Depends(optional_user)) -> User:
    if not user:
        raise ApiError(401, "auth_required", "Нужно войти или продолжить как гость")
    return user


def require_role(min_role: str) -> Callable[..., User]:
    def dep(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)) -> User:
        if ROLE_LEVEL.get(user.role, 0) < ROLE_LEVEL[min_role]:
            from .audit import audit
            audit(db, user, "access_denied", "route", request.url.path, result="denied",
                  details={"required": min_role}, request=request)
            db.commit()
            raise ApiError(403, "forbidden", "Недостаточно прав для этого действия")
        return user

    return dep
