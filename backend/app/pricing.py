"""Расчёт цены. Все суммы — целые копейки BYN (ОТ-07).

Формула (документирована в README):
  unit      = round(base × size.mult) + cover.add + paper.add + extra_pages_cost
  extra     = max(0, pages − included) / 2 × extra_spread × size.mult        (для книг)
  prints    = photos × round(base × size.mult)                                (для печати)
  subtotal  = unit × quantity
  discount  = percent: subtotal × p / 100 | fixed: min(value, subtotal)
  delivery  = тариф способа; бесплатно, если (subtotal − discount) ≥ порога или промокод free_delivery
  total     = subtotal − discount + delivery
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from sqlalchemy.orm import Session

from .errors import ApiError
from .models import Product, PromoCode

DELIVERY = {
    "pickup": {"label": "Самовывоз из пункта picPac", "price_minor": 0, "days": 0, "free_from_minor": 0},
    "courier": {"label": "Курьер по Минску", "price_minor": 900, "days": 1, "free_from_minor": 15000},
    "post": {"label": "Белпочта по Беларуси", "price_minor": 550, "days": 3, "free_from_minor": 10000},
    "europost": {"label": "Европочта", "price_minor": 450, "days": 2, "free_from_minor": 10000},
}


def _find(items: list[dict], item_id: Optional[str]) -> dict:
    if not items:
        return {}
    for it in items:
        if it["id"] == item_id:
            return it
    return items[0]


@dataclass
class Quote:
    unit_minor: int
    subtotal_minor: int
    discount_minor: int
    delivery_minor: int
    total_minor: int
    currency: str = "BYN"
    lines: list[dict[str, Any]] = field(default_factory=list)
    promo: Optional[dict[str, Any]] = None
    promo_error: Optional[str] = None
    production_days: int = 1
    delivery_days: int = 0

    def as_dict(self) -> dict[str, Any]:
        return self.__dict__


def unit_price(product: Product, options: dict[str, Any], pages: int, photos: int) -> tuple[int, list[dict]]:
    specs = product.specs or {}
    size = _find(specs.get("sizes", []), options.get("size"))
    cover = _find(specs.get("covers", []), options.get("cover"))
    paper = _find(specs.get("papers", []), options.get("paper"))
    color = _find(specs.get("colors", []), options.get("color"))
    mult = float(size.get("mult", 1.0))
    lines: list[dict] = []
    if product.kind == "prints":
        each = round(product.base_price_minor * mult)
        count = max(photos, 1)
        unit = each * count
        lines.append({"label": f"Печать {size.get('label', '')} × {count} шт.", "amount_minor": unit})
    else:
        base = round(product.base_price_minor * mult)
        lines.append({"label": f"{product.title}, {size.get('label', '')}", "amount_minor": base})
        unit = base
        pg = specs.get("pages") or {}
        included = int(pg.get("included", pages))
        if pages > included:
            extra = round((pages - included) / 2 * pg.get("extra_spread_minor", 0) * mult)
            lines.append({"label": f"Доп. страницы: {pages - included}", "amount_minor": extra})
            unit += extra
    for opt, label in ((cover, "Вариант" if product.kind != "book" else "Обложка"), (paper, "Бумага"), (color, "Цвет")):
        add = int(opt.get("add_minor", 0)) if opt else 0
        if add:
            lines.append({"label": f"{label}: {opt['label']}", "amount_minor": add})
            unit += add
    return unit, lines


def quote(
    db: Session,
    product: Product,
    options: dict[str, Any],
    pages: int,
    photos: int,
    quantity: int = 1,
    delivery_method: str = "pickup",
    promo_code: Optional[str] = None,
) -> Quote:
    if quantity < 1 or quantity > 50:
        raise ApiError(422, "bad_quantity", "Количество должно быть от 1 до 50")
    if delivery_method not in DELIVERY:
        raise ApiError(422, "bad_delivery", "Неизвестный способ получения")
    unit, lines = unit_price(product, options, pages, photos)
    subtotal = unit * quantity
    if quantity > 1:
        lines.append({"label": f"Количество × {quantity}", "amount_minor": unit * (quantity - 1)})
    discount = 0
    promo_info = None
    promo_error = None
    free_delivery = False
    if promo_code:
        promo = db.get(PromoCode, promo_code.strip().upper())
        if not promo or not promo.active:
            promo_error = "Промокод не найден или больше не действует"
        elif subtotal < promo.min_total_minor:
            promo_error = f"Промокод действует от {promo.min_total_minor / 100:.2f} BYN"
        else:
            if promo.kind == "percent":
                discount = round(subtotal * promo.value / 100)
            elif promo.kind == "fixed":
                discount = min(promo.value, subtotal)
            elif promo.kind == "free_delivery":
                free_delivery = True
            promo_info = {"code": promo.code, "kind": promo.kind, "value": promo.value,
                          "description": promo.description}
    d = DELIVERY[delivery_method]
    delivery = d["price_minor"]
    if free_delivery or (d["free_from_minor"] and subtotal - discount >= d["free_from_minor"]):
        delivery = 0
    total = subtotal - discount + delivery
    return Quote(
        unit_minor=unit, subtotal_minor=subtotal, discount_minor=discount, delivery_minor=delivery,
        total_minor=total, lines=lines, promo=promo_info, promo_error=promo_error,
        production_days=product.production_days, delivery_days=d["days"],
    )
