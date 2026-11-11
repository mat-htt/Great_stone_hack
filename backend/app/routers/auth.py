from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db, utcnow
from ..errors import ApiError
from ..imaging import delete_media
from ..models import Notification, Photo, Project, User
from ..security import create_token, current_user, hash_password, optional_user, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str
    password: str


class RegisterIn(BaseModel):
    email: str = Field(min_length=5, max_length=200)
    password: str = Field(min_length=6, max_length=100)
    name: str = Field(min_length=1, max_length=80)


def user_public(u: User) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name, "role": u.role, "is_guest": u.is_guest,
            "created_at": u.created_at.isoformat()}


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.strip().lower(), User.deleted_at.is_(None)).first()
    if not user or not verify_password(body.password, user.password_hash):
        audit(db, None, "login", "user", body.email, result="denied", request=request)
        db.commit()
        raise ApiError(401, "bad_credentials", "Неверная почта или пароль")
    audit(db, user, "login", "user", user.id, request=request)
    db.commit()
    return {"token": create_token(user), "user": user_public(user)}


@router.post("/guest")
def guest(request: Request, db: Session = Depends(get_db)):
    user = User(name="Гость", role="client", is_guest=True)
    db.add(user)
    db.flush()
    db.add(Notification(user_id=user.id, title="Мур! Я Кот, ваш арт-директор",
                        body="Выберите фото — я сам соберу из них книгу. А Робот проверит всё перед печатью.",
                        mascot="cat"))
    audit(db, user, "guest_start", "user", user.id, request=request)
    db.commit()
    return {"token": create_token(user), "user": user_public(user)}


@router.post("/register")
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db),
             current: Optional[User] = Depends(optional_user)):
    """Регистрация. Если запрос пришёл от гостя — его проекты и фото сохраняются (идентификация гостя)."""
    email = body.email.strip().lower()
    if db.query(User).filter_by(email=email).first():
        raise ApiError(409, "email_taken", "Такая почта уже зарегистрирована — войдите")
    if current and current.is_guest:
        current.email, current.name, current.is_guest = email, body.name, False
        current.password_hash = hash_password(body.password)
        target = current
    else:
        target = User(email=email, name=body.name, password_hash=hash_password(body.password), role="client")
        db.add(target)
    db.flush()
    audit(db, target, "register", "user", target.id, details={"from_guest": bool(current and current is target)},
          request=request)
    db.commit()
    return {"token": create_token(target), "user": user_public(target)}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_public(user)


@router.delete("/me")
def delete_me(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Удаление аккаунта и всех загруженных фото (МП-06). Заказы обезличиваются."""
    photos = db.query(Photo).filter_by(owner_id=user.id).all()
    for p in photos:
        delete_media(p.path, p.thumb_path)
        db.delete(p)
    for pr in db.query(Project).filter_by(owner_id=user.id, status="draft").all():
        db.delete(pr)
    audit(db, user, "account_delete", "user", user.id, details={"photos_deleted": len(photos)}, request=request)
    user.email = None
    user.name = "Удалённый пользователь"
    user.password_hash = None
    user.deleted_at = utcnow()
    db.commit()
    return {"ok": True, "photos_deleted": len(photos)}
