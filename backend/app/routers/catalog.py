from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..errors import ApiError
from ..models import Product
from ..pricing import DELIVERY, quote

router = APIRouter(prefix="/api", tags=["catalog"])


def product_public(p: Product) -> dict:
    q_pages = (p.specs.get("pages") or {}).get("included", 0)
    return {"id": p.id, "title": p.title, "subtitle": p.subtitle, "category": p.category, "kind": p.kind,
            "mockup": p.mockup,
            "description": p.description, "base_price_minor": p.base_price_minor, "currency": p.currency,
            "production_days": p.production_days, "specs": p.specs, "badge": p.badge, "accent": p.accent,
            "from_price_minor": p.base_price_minor * (1 if p.kind != "prints" else 1),
            "included_pages": q_pages}


@router.get("/catalog")
def catalog(db: Session = Depends(get_db)):
    items = db.query(Product).filter_by(active=True).order_by(Product.sort).all()
    from ..seed.seed import load_catalog
    return {"items": [product_public(p) for p in items], "categories": load_catalog()["categories"],
            "delivery": [{"id": k, **v} for k, v in DELIVERY.items()]}


@router.get("/catalog/{product_id}")
def product(product_id: str, db: Session = Depends(get_db)):
    p = db.get(Product, product_id)
    if not p or not p.active:
        raise ApiError(404, "product_not_found", "Такого продукта нет в каталоге")
    return product_public(p)


class QuoteIn(BaseModel):
    product_id: str
    options: dict = {}
    pages: int = 20
    photos: int = 10
    quantity: int = 1
    delivery_method: str = "pickup"
    promo_code: Optional[str] = None


@router.post("/quote")
def get_quote(body: QuoteIn, db: Session = Depends(get_db)):
    p = db.get(Product, body.product_id)
    if not p:
        raise ApiError(404, "product_not_found", "Такого продукта нет в каталоге")
    return quote(db, p, body.options, body.pages, body.photos, body.quantity, body.delivery_method,
                 body.promo_code).as_dict()
