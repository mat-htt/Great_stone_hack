from __future__ import annotations

import secrets
from typing import Any, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..ai import engine as ai
from ..audit import audit
from ..db import get_db, utcnow
from ..errors import ApiError
from ..layout import MONTHS, TEMPLATES, auto_layout, curate, place_title, preflight
from ..models import Photo, Product, Project, ProjectMember, User
from ..security import current_user
from ..services import can_access_project, photo_public
from .catalog import product_public

router = APIRouter(prefix="/api", tags=["projects"])


def _get(db: Session, user: User, project_id: str) -> Project:
    p = db.get(Project, project_id)
    if not p or not can_access_project(db, user, p):
        raise ApiError(404, "project_not_found", "Проект не найден")
    return p


def _photos(db: Session, project: Project) -> list[Photo]:
    return db.query(Photo).filter_by(project_id=project.id).all()


def project_public(db: Session, p: Project, full: bool = True) -> dict[str, Any]:
    product = db.get(Product, p.product_id)
    owner = db.get(User, p.owner_id)
    data = {
        "id": p.id, "title": p.title, "product_id": p.product_id, "options": p.options, "status": p.status,
        "revision": p.revision, "share_code": p.share_code, "owner_id": p.owner_id,
        "owner_name": owner.name if owner else "", "pages_count": len((p.layout or {}).get("pages", [])),
        "cover_photo_id": ((p.layout or {}).get("cover") or {}).get("photo_id"),
        "created_at": p.created_at.isoformat(), "updated_at": p.updated_at.isoformat(),
        "members": [{"user_id": m.user_id, "name": m.display_name, "joined_at": m.joined_at.isoformat()}
                    for m in p.members],
    }
    if full:
        photos = _photos(db, p)
        data["layout"] = p.layout
        data["photos"] = [photo_public(x) for x in photos]
        data["product"] = product_public(product) if product else None
        counts: dict[int, int] = {}
        for x in photos:
            counts[x.owner_id] = counts.get(x.owner_id, 0) + 1
        data["contributions"] = counts
    return data


class CreateIn(BaseModel):
    product_id: str
    title: Optional[str] = None
    options: dict[str, Any] = {}
    photo_ids: list[str] = []
    auto: bool = True


@router.post("/projects")
def create(body: CreateIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    product = db.get(Product, body.product_id)
    if not product:
        raise ApiError(404, "product_not_found", "Такого продукта нет в каталоге")
    specs = product.specs or {}
    options = {"size": specs.get("sizes", [{}])[0].get("id"),
               "cover": (specs.get("covers") or [{}])[0].get("id"),
               "paper": (specs.get("papers") or [{}])[0].get("id"), **body.options}
    project = Project(owner_id=user.id, product_id=product.id, title=body.title or product.title, options=options,
                      layout={"cover": None, "pages": []})
    db.add(project)
    db.flush()
    photos = []
    for pid in body.photo_ids[:400]:
        ph = db.get(Photo, pid)
        if ph and ph.owner_id == user.id:
            ph.project_id = project.id
            photos.append(ph)
    rejected = []
    if body.auto and photos:
        res = _apply_curate(db, user, project, product, photos)
        rejected = res["rejected"]
    elif product.kind == "book":
        project.layout = auto_layout(product, options, [], project.title)
    audit(db, user, "project_create", "project", project.id, details={"product": product.id, "photos": len(photos)},
          request=request)
    db.commit()
    return {**project_public(db, project), "curation": {"rejected": rejected}}


def _target(product: Product) -> int:
    if product.kind == "wall":
        return 1
    if product.kind == "calendar":
        return 13
    if product.kind == "prints":
        return (product.specs.get("photos") or {}).get("max", 200)
    return int((product.specs.get("pages") or {}).get("max", 60) * 1.6)


def _apply_curate(db: Session, user: User, project: Project, product: Product, photos: list[Photo],
                  seed: Optional[int] = None, per_page: Optional[float] = None) -> dict[str, Any]:
    if product.kind == "prints":
        selected, rejected = sorted(photos, key=lambda p: (p.taken_at or p.created_at)), []
    else:
        res = curate(photos, _target(product))
        selected, rejected = res["selected"], res["rejected"]
    title = project.title
    if title == product.title:
        title = place_title(selected) or title
        project.title = title
    project.layout = auto_layout(product, project.options, selected, title, seed=seed, per_page=per_page)
    project.revision += 1
    project.updated_at = utcnow()
    ai._log(db, "curate", ai.db_builtin(db), "picpac-curator-1", user, project.id, "ok", __import__("time").perf_counter())
    ai._log(db, "layout", ai.db_builtin(db), "picpac-layout-1", user, project.id, "ok", __import__("time").perf_counter())
    return {"selected": [p.id for p in selected], "rejected": rejected}


@router.get("/projects")
def list_projects(user: User = Depends(current_user), db: Session = Depends(get_db)):
    own = db.query(Project).filter_by(owner_id=user.id).all()
    member_ids = [m.project_id for m in db.query(ProjectMember).filter_by(user_id=user.id).all()]
    shared = db.query(Project).filter(Project.id.in_(member_ids)).all() if member_ids else []
    items = sorted({p.id: p for p in own + shared}.values(), key=lambda p: p.updated_at, reverse=True)
    return {"items": [project_public(db, p, full=False) | {"role": "owner" if p.owner_id == user.id else "member"}
                      for p in items]}


@router.get("/projects/{project_id}")
def get_project(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return project_public(db, _get(db, user, project_id))


class SaveIn(BaseModel):
    title: Optional[str] = Field(default=None, max_length=160)
    options: Optional[dict[str, Any]] = None
    layout: Optional[dict[str, Any]] = None
    revision: int
    force: bool = False


def _validate_layout(layout: dict[str, Any]) -> dict[str, Any]:
    pages = layout.get("pages")
    if not isinstance(pages, list) or len(pages) > 200:
        raise ApiError(422, "bad_layout", "Некорректный макет")
    for pg in pages:
        if pg.get("template") not in TEMPLATES:
            raise ApiError(422, "bad_layout", f"Неизвестный шаблон страницы: {pg.get('template')}")
        if not isinstance(pg.get("slots"), list):
            raise ApiError(422, "bad_layout", "Некорректный макет")
    return layout


@router.put("/projects/{project_id}")
def save(project_id: str, body: SaveIn, request: Request, user: User = Depends(current_user),
         db: Session = Depends(get_db)):
    """Автосохранение черновика с контролем версий: конфликт → 409 с актуальной версией."""
    p = _get(db, user, project_id)
    if p.status != "draft":
        raise ApiError(409, "project_locked", "Проект уже заказан — изменить его нельзя, можно сделать копию")
    if body.revision != p.revision and not body.force:
        raise ApiError(409, "revision_conflict", "Проект изменён на другом устройстве",
                       {"server": project_public(db, p)})
    if body.title is not None:
        p.title = body.title.strip() or p.title
    if body.options is not None:
        p.options = {**p.options, **body.options}
    if body.layout is not None:
        p.layout = _validate_layout(body.layout)
    p.revision += 1
    p.updated_at = utcnow()
    audit(db, user, "project_save", "project", p.id, details={"revision": p.revision}, request=request)
    db.commit()
    return {"revision": p.revision, "updated_at": p.updated_at.isoformat()}


class CurateIn(BaseModel):
    mode: str = "curate"  # curate | shuffle | compact | spacious | cover
    seed: Optional[int] = None


@router.post("/projects/{project_id}/relayout")
def relayout(project_id: str, body: CurateIn, request: Request, user: User = Depends(current_user),
             db: Session = Depends(get_db)):
    p = _get(db, user, project_id)
    if p.status != "draft":
        raise ApiError(409, "project_locked", "Проект уже заказан")
    product = db.get(Product, p.product_id)
    photos = _photos(db, p)
    if not photos:
        raise ApiError(422, "no_photos", "Сначала добавьте фото в проект")
    if body.mode == "cover":
        best = max(photos, key=lambda x: (x.width >= x.height, x.score))
        from ..layout import _slot
        p.layout = {**p.layout, "cover": _slot(best)}
        p.revision += 1
        result = {"rejected": []}
    else:
        seed = body.seed if body.seed is not None else (secrets.randbelow(10**6) if body.mode != "curate" else None)
        per_page = {"compact": 3.2, "spacious": 1.2}.get(body.mode)
        result = _apply_curate(db, user, p, product, photos, seed=seed, per_page=per_page)
    audit(db, user, "project_relayout", "project", p.id, details={"mode": body.mode}, request=request)
    db.commit()
    return {**project_public(db, p), "curation": {"rejected": result["rejected"]}}


@router.get("/projects/{project_id}/preflight")
def project_preflight(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = _get(db, user, project_id)
    product = db.get(Product, p.product_id)
    photos = {x.id: x for x in db.query(Photo).filter(Photo.owner_id.isnot(None)).filter(
        Photo.id.in_(_layout_photo_ids(p.layout))).all()}
    return preflight(product, p.options, p.layout, photos)


def _layout_photo_ids(layout: dict[str, Any]) -> list[str]:
    ids = [s.get("photo_id") for pg in layout.get("pages", []) for s in pg.get("slots", []) if s.get("photo_id")]
    cover = (layout.get("cover") or {}).get("photo_id")
    return ids + ([cover] if cover else [])


@router.post("/projects/{project_id}/captions")
def captions(project_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = _get(db, user, project_id)
    photos = {x.id: x for x in _photos(db, p)}
    pages_info = []
    for pg in p.layout.get("pages", []):
        ph = next((photos.get(s["photo_id"]) for s in pg.get("slots", []) if s.get("photo_id") in photos), None)
        date = f"{ph.taken_at.day} {MONTHS[ph.taken_at.month - 1]}" if ph and ph.taken_at else ""
        pages_info.append({"date": date, "place": ph.place if ph else ""})
    res = ai.run_text(db, "captions", user, {"title": p.title, "pages": pages_info}, p.id)
    caps = res.get("captions", [])
    for i, pg in enumerate(p.layout.get("pages", [])):
        if i < len(caps) and (TEMPLATES[pg["template"]].get("caption") or pg.get("caption") is not None):
            pg["caption"] = caps[i]
    if res.get("title"):
        p.title = res["title"]
    p.layout = dict(p.layout)
    p.revision += 1
    audit(db, user, "ai_captions", "project", p.id, details=res.get("_meta", {}), request=request)
    db.commit()
    return {**project_public(db, p), "ai": res.get("_meta")}


@router.post("/projects/{project_id}/share")
def share(project_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = _get(db, user, project_id)
    if p.owner_id != user.id:
        raise ApiError(403, "forbidden", "Поделиться может только создатель альбома")
    if not p.share_code:
        p.share_code = secrets.token_urlsafe(6).replace("-", "x").replace("_", "y")[:8]
    audit(db, user, "project_share", "project", p.id, request=request)
    db.commit()
    return {"share_code": p.share_code, "link": f"/join/{p.share_code}"}


@router.delete("/projects/{project_id}")
def delete_project(project_id: str, request: Request, user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    p = _get(db, user, project_id)
    if p.owner_id != user.id or p.status != "draft":
        raise ApiError(409, "cannot_delete", "Удалить можно только свой черновик")
    for ph in _photos(db, p):
        ph.project_id = None
    db.delete(p)
    audit(db, user, "project_delete", "project", project_id, request=request)
    db.commit()
    return {"ok": True}


@router.get("/shared/{code}")
def shared_info(code: str, db: Session = Depends(get_db)):
    p = db.query(Project).filter_by(share_code=code).first()
    if not p:
        raise ApiError(404, "share_not_found", "Ссылка недействительна или альбом закрыт")
    owner = db.get(User, p.owner_id)
    product = db.get(Product, p.product_id)
    return {"project_id": p.id, "title": p.title, "owner_name": owner.name if owner else "",
            "product_title": product.title if product else "", "members": len(p.members) + 1,
            "photos": db.query(Photo).filter_by(project_id=p.id).count(), "status": p.status}


class JoinIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=60)


@router.post("/shared/{code}/join")
def join(code: str, body: JoinIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.query(Project).filter_by(share_code=code).first()
    if not p:
        raise ApiError(404, "share_not_found", "Ссылка недействительна или альбом закрыт")
    if p.owner_id != user.id and not db.query(ProjectMember).filter_by(project_id=p.id, user_id=user.id).first():
        db.add(ProjectMember(project_id=p.id, user_id=user.id, display_name=body.display_name.strip()))
        if user.is_guest and user.name == "Гость":
            user.name = body.display_name.strip()
        from ..services import notify
        notify(db, p.owner_id, "В альбоме новый участник", f"{body.display_name} присоединился к «{p.title}»",
               link=f"/editor/{p.id}", mascot="cat")
    audit(db, user, "project_join", "project", p.id, request=request)
    db.commit()
    return {"project_id": p.id}
