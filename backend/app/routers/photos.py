from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import imaging
from ..audit import audit
from ..config import MAX_UPLOAD_MB, MEDIA_DIR, MIN_PHOTO_SIDE
from ..db import get_db
from ..errors import ApiError
from ..layout import cluster_memories
from ..models import Photo, Project, User
from ..security import current_user
from ..seed import gallery
from ..services import can_access_photo, can_access_project, create_photo, photo_public

router = APIRouter(prefix="/api", tags=["photos"])
ALLOWED = {"JPEG": "image/jpeg", "PNG": "image/png", "MPO": "image/jpeg"}


def _check_project(db: Session, user: User, project_id: Optional[str]) -> Optional[Project]:
    if not project_id:
        return None
    project = db.get(Project, project_id)
    if not project or not can_access_project(db, user, project):
        raise ApiError(404, "project_not_found", "Проект не найден")
    return project


@router.post("/photos")
async def upload(request: Request, files: list[UploadFile] = File(...), project_id: Optional[str] = Form(None),
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Загрузка JPEG/PNG. Каждый файл проверяется отдельно — ошибка одного не ломает остальные."""
    _check_project(db, user, project_id)
    ok, rejected = [], []
    for f in files[:60]:
        data = await f.read()
        name = f.filename or "photo.jpg"
        if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
            rejected.append({"filename": name, "reason": f"Файл больше {MAX_UPLOAD_MB} МБ"})
            continue
        try:
            probe = Image.open(__import__("io").BytesIO(data))
            fmt = probe.format
        except (UnidentifiedImageError, OSError):
            rejected.append({"filename": name, "reason": "Это не изображение или файл повреждён"})
            continue
        if fmt not in ALLOWED:
            rejected.append({"filename": name, "reason": f"Формат {fmt} не поддерживается — нужен JPEG или PNG"})
            continue
        img = imaging.open_image(data)
        if min(img.size) < MIN_PHOTO_SIDE:
            rejected.append({"filename": name,
                             "reason": f"Слишком маленькое фото ({img.width}×{img.height}). Нужно от {MIN_PHOTO_SIDE} px"})
            continue
        photo = create_photo(db, user, img, name, taken_at=imaging.exif_taken_at(data), project_id=project_id,
                             mime=ALLOWED[fmt])
        ok.append(photo)
    audit(db, user, "photo_upload", "project" if project_id else "library", project_id or "-",
          details={"uploaded": len(ok), "rejected": len(rejected)}, request=request)
    db.commit()
    return {"photos": [photo_public(p) for p in ok], "rejected": rejected}


@router.get("/photos")
def list_photos(project_id: Optional[str] = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if project_id:
        _check_project(db, user, project_id)
        q = db.query(Photo).filter_by(project_id=project_id)
    else:
        q = db.query(Photo).filter_by(owner_id=user.id)
    photos = q.order_by(Photo.taken_at.is_(None), Photo.taken_at, Photo.created_at).all()
    return {"photos": [photo_public(p) for p in photos]}


class AttachIn(BaseModel):
    photo_ids: list[str]
    project_id: str


@router.post("/photos/attach")
def attach(body: AttachIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _check_project(db, user, body.project_id)
    n = 0
    for pid in body.photo_ids[:400]:
        p = db.get(Photo, pid)
        if p and p.owner_id == user.id:
            p.project_id = body.project_id
            n += 1
    db.commit()
    return {"attached": n}


@router.delete("/photos/{photo_id}")
def delete_photo(photo_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(Photo, photo_id)
    if not p or p.owner_id != user.id:
        raise ApiError(404, "photo_not_found", "Фото не найдено")
    imaging.delete_media(p.path, p.thumb_path)
    db.delete(p)
    audit(db, user, "photo_delete", "photo", photo_id, request=request)
    db.commit()
    return {"ok": True}


@router.delete("/photos")
def delete_all(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    photos = db.query(Photo).filter_by(owner_id=user.id).all()
    for p in photos:
        imaging.delete_media(p.path, p.thumb_path)
        db.delete(p)
    audit(db, user, "photo_delete_all", "library", user.id, details={"count": len(photos)}, request=request)
    db.commit()
    return {"deleted": len(photos)}


@router.get("/media/{photo_id}")
def media(photo_id: str, size: str = Query("full"), user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(Photo, photo_id)
    if not p or not can_access_photo(db, user, p):
        raise ApiError(404, "photo_not_found", "Фото не найдено")
    rel = p.thumb_path if size == "thumb" else p.path
    return FileResponse(MEDIA_DIR / rel, media_type="image/jpeg",
                        headers={"Cache-Control": "private, max-age=86400"})


@router.get("/memories")
def memories(user: User = Depends(current_user), db: Session = Depends(get_db)):
    photos = db.query(Photo).filter(Photo.owner_id == user.id, Photo.source != "ai").all()
    return {"memories": cluster_memories(photos)}


@router.get("/gallery")
def demo_gallery(user: User = Depends(current_user)):
    items = gallery.generate()
    return {"items": [{**it, "thumb": f"/api/gallery/file/{it['file']}"} for it in items]}


@router.get("/gallery/file/{name}")
def gallery_file(name: str):
    try:
        path = gallery.gallery_path(name)
    except ValueError:
        raise ApiError(404, "not_found", "Не найдено")
    if not path.exists():
        raise ApiError(404, "not_found", "Не найдено")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=604800"})


class ImportIn(BaseModel):
    files: list[str]
    project_id: Optional[str] = None


@router.post("/gallery/import")
def import_gallery(body: ImportIn, request: Request, user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    _check_project(db, user, body.project_id)
    index = {it["file"]: it for it in gallery.generate()}
    out = []
    for name in body.files[:80]:
        it = index.get(name)
        if not it:
            continue
        img = Image.open(gallery.gallery_path(name)).convert("RGB")
        out.append(create_photo(db, user, img, name, source="gallery", place=it["place"],
                                taken_at=datetime.fromisoformat(it["taken_at"]), project_id=body.project_id))
    audit(db, user, "gallery_import", "project", body.project_id or "-", details={"count": len(out)}, request=request)
    db.commit()
    return {"photos": [photo_public(p) for p in out], "rejected": []}
