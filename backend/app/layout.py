"""Режиссёр книги: отбор кадров (Кот), автораскладка и предпечатная проверка (Робот)."""
from __future__ import annotations

import random
from datetime import timedelta
from typing import Any, Iterable, Optional

from .config import CRITICAL_DPI, RECOMMENDED_DPI, WARNING_DPI
from .imaging import hamming, sharpness_norm
from .models import Photo, Product

# Шаблоны страниц: слоты в долях страницы (x, y, w, h)
TEMPLATES: dict[str, dict[str, Any]] = {
    "full": {"title": "Во всю страницу", "slots": [(0, 0, 1, 1)]},
    "frame": {"title": "С полями", "slots": [(0.09, 0.09, 0.82, 0.82)]},
    "duo": {"title": "Два вертикальных", "slots": [(0.05, 0.05, 0.43, 0.9), (0.52, 0.05, 0.43, 0.9)]},
    "duo_h": {"title": "Два горизонтальных", "slots": [(0.05, 0.05, 0.9, 0.43), (0.05, 0.52, 0.9, 0.43)]},
    "trio": {"title": "Один большой + два", "slots": [(0.05, 0.05, 0.56, 0.9), (0.65, 0.05, 0.3, 0.43),
                                                       (0.65, 0.52, 0.3, 0.43)]},
    "quad": {"title": "Сетка 2×2", "slots": [(0.05, 0.05, 0.43, 0.43), (0.52, 0.05, 0.43, 0.43),
                                              (0.05, 0.52, 0.43, 0.43), (0.52, 0.52, 0.43, 0.43)]},
    "story": {"title": "Фото + подпись", "slots": [(0, 0, 1, 0.74)], "caption": True},
    "text": {"title": "Страница-цитата", "slots": [], "caption": True},
}

INTERLUDES = ["Самые тёплые дни", "Помним этот момент", "Здесь начиналось лето", "Улыбки, которые остаются",
              "Продолжение следует…", "Время остановилось", "Вместе", "Мгновения, которые хочется вернуть"]

MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября",
          "октября", "ноября", "декабря"]
MONTHS_NOM = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь",
              "октябрь", "ноябрь", "декабрь"]


def page_size_cm(product: Product, options: dict[str, Any]) -> tuple[float, float]:
    sizes = (product.specs or {}).get("sizes", [])
    size = next((s for s in sizes if s["id"] == options.get("size")), sizes[0] if sizes else None)
    if not size:
        return 20.0, 20.0
    return float(size["w_cm"]), float(size["h_cm"])


def focus_point(photo: Photo) -> tuple[float, float]:
    if photo.faces:
        xs = [f["x"] + f["w"] / 2 for f in photo.faces]
        ys = [f["y"] + f["h"] / 2 for f in photo.faces]
        return round(sum(xs) / len(xs), 3), round(max(0.2, min(0.8, sum(ys) / len(ys))), 3)
    return 0.5, 0.45


def is_portrait(p: Photo) -> bool:
    return p.height > p.width * 1.05


def _slot(photo: Optional[Photo]) -> dict[str, Any]:
    if photo is None:
        return {"photo_id": None, "crop": {"x": 0.5, "y": 0.5, "zoom": 1.0}}
    fx, fy = focus_point(photo)
    return {"photo_id": photo.id, "crop": {"x": fx, "y": fy, "zoom": 1.0}}


def _page(template: str, photos: list[Optional[Photo]], caption: str = "") -> dict[str, Any]:
    slots = TEMPLATES[template]["slots"]
    filled = list(photos) + [None] * (len(slots) - len(photos))
    page = {"id": f"p{random.randint(10**7, 10**8 - 1)}", "template": template,
            "slots": [_slot(p) for p in filled[: len(slots)]]}
    if caption or TEMPLATES[template].get("caption"):
        page["caption"] = caption
    return page


def place_title(photos: Iterable[Photo]) -> str:
    photos = [p for p in photos if p.taken_at]
    places = [p.place for p in photos if p.place]
    place = max(set(places), key=places.count) if places else ""
    if not photos:
        return place or "Наши моменты"
    d = min(p.taken_at for p in photos)
    season = {12: "Зима", 1: "Зима", 2: "Зима", 3: "Весна", 4: "Весна", 5: "Весна", 6: "Лето", 7: "Лето",
              8: "Лето", 9: "Осень", 10: "Осень", 11: "Осень"}[d.month]
    return f"{place} · {season} {d.year}" if place else f"{season} {d.year}"


def cluster_memories(photos: list[Photo]) -> list[dict[str, Any]]:
    """Группирует снимки в «воспоминания» по времени и месту (разрыв > 36 ч — новое событие)."""
    dated = sorted([p for p in photos if p.taken_at], key=lambda p: p.taken_at)
    groups: list[list[Photo]] = []
    for p in dated:
        if groups and (p.taken_at - groups[-1][-1].taken_at) < timedelta(hours=36) and \
                (p.place == groups[-1][-1].place or not p.place):
            groups[-1].append(p)
        else:
            groups.append([p])
    result = []
    for g in groups:
        if len(g) < 3:
            continue
        best = sorted(g, key=lambda x: x.score, reverse=True)
        start, end = g[0].taken_at, g[-1].taken_at
        if start.date() == end.date():
            when = f"{start.day} {MONTHS[start.month - 1]} {start.year}"
        elif start.month == end.month:
            when = f"{start.day}–{end.day} {MONTHS[start.month - 1]} {start.year}"
        else:
            when = f"{MONTHS_NOM[start.month - 1].capitalize()} — {MONTHS_NOM[end.month - 1]} {end.year}"
        result.append({
            "id": f"m{g[0].id[:8]}", "title": place_title(g), "subtitle": when, "count": len(g),
            "cover_id": best[0].id, "photo_ids": [p.id for p in g], "preview_ids": [p.id for p in best[:4]],
        })
    result.sort(key=lambda m: m["count"], reverse=True)
    return result


def curate(photos: list[Photo], target: int) -> dict[str, Any]:
    """Отбор кадров: убираем дубли (оставляем лучший), сильно размытые и тёмные, ограничиваем количество."""
    ordered = sorted(photos, key=lambda p: p.score, reverse=True)
    kept: list[Photo] = []
    rejected: list[dict[str, Any]] = []
    for p in ordered:
        dup = next((k for k in kept if hamming(k.phash, p.phash) <= 9), None)
        if dup is not None:
            rejected.append({"id": p.id, "reason": "duplicate", "label": "Похожий кадр — оставили лучший",
                             "twin_id": dup.id})
            continue
        kept.append(p)
    final: list[Photo] = []
    for p in kept:
        if sharpness_norm(p.sharpness) < 0.12 and len(kept) - len(rejected) > 6:
            rejected.append({"id": p.id, "reason": "blurry", "label": "Размытый кадр"})
        elif p.brightness < 38 and len(kept) > 8:
            rejected.append({"id": p.id, "reason": "dark", "label": "Слишком тёмный кадр"})
        else:
            final.append(p)
    if len(final) > target:
        for p in final[target:]:
            rejected.append({"id": p.id, "reason": "limit", "label": "Не вошёл в лимит — можно вернуть"})
        final = final[:target]
    final.sort(key=lambda p: (p.taken_at.timestamp() if p.taken_at else 0, p.created_at.timestamp()))
    return {"selected": final, "rejected": rejected}


def auto_layout(product: Product, options: dict[str, Any], photos: list[Photo], title: str = "",
                seed: Optional[int] = None, per_page: Optional[float] = None) -> dict[str, Any]:
    """Раскладка по разворотам с учётом ориентации, «героев» и ограничений продукта."""
    specs = product.specs or {}
    pg = specs.get("pages") or {}
    if product.kind in ("prints", "wall"):
        pages = [_page("full", [p]) for p in photos] or [_page("full", [])]
        return {"cover": None, "pages": pages, "title": title}
    if product.kind == "calendar":
        pool = photos[:]
        pages = [_page("full", [pool.pop(0)] if pool else [], caption=MONTHS_NOM[m].capitalize())
                 for m in range(12)]
        return {"cover": _slot(photos[0] if photos else None), "pages": pages, "title": title or "Календарь 2027"}

    min_pages = int(pg.get("min", 20))
    max_pages = int(pg.get("max", 80))
    pool = photos[:]
    cover = pool[0] if pool else None
    if pool:
        cover = max(pool, key=lambda p: (0 if is_portrait(p) else 1, p.score))
    heroes = {p.id for p in sorted(pool, key=lambda p: p.score, reverse=True)[: max(1, len(pool) // 7)]}

    pages: list[dict[str, Any]] = []
    i = 0
    rng = random.Random(seed if seed is not None else len(pool))
    if seed is not None:
        heroes = {p.id for p in rng.sample(pool, k=max(1, len(pool) // 7))} if pool else set()
    # Сколько фото в среднем на страницу, чтобы попасть в диапазон страниц
    target_pages = max(min_pages, min(max_pages, round(len(pool) / (per_page or 1.9))))
    if target_pages % 2:
        target_pages += 1
    density = len(pool) / max(1, target_pages)
    while i < len(pool):
        p = pool[i]
        remaining_photos = len(pool) - i
        remaining_pages = max(1, target_pages - len(pages))
        need = remaining_photos / remaining_pages
        if p.id in heroes or need <= 1.05:
            tpl = "story" if (not is_portrait(p) and rng.random() < 0.35) else ("full" if rng.random() < 0.7 else "frame")
            pages.append(_page(tpl, [p], caption=""))
            i += 1
            continue
        if need > 3 and remaining_photos >= 4:
            pages.append(_page("quad", pool[i:i + 4]))
            i += 4
            continue
        if need > 2.2 and remaining_photos >= 3:
            pages.append(_page("trio", pool[i:i + 3]))
            i += 3
            continue
        if remaining_photos >= 2:
            pair = pool[i:i + 2]
            tpl = "duo" if all(is_portrait(x) for x in pair) else ("duo_h" if not any(is_portrait(x) for x in pair)
                                                                    else "duo")
            pages.append(_page(tpl, pair))
            i += 2
            continue
        pages.append(_page("full", [p]))
        i += 1
    # Добиваем до минимума: сначала разбиваем многослотовые страницы
    guard = 0
    while len(pages) < min_pages and guard < 200:
        guard += 1
        idx = next((k for k, pgx in enumerate(pages) if len(pgx["slots"]) > 1), None)
        if idx is None:
            break
        page = pages.pop(idx)
        ids = [s for s in page["slots"] if s["photo_id"]]
        split = [{"id": f"p{rng.randint(10**7, 10**8 - 1)}", "template": "full", "slots": [s]} for s in ids]
        pages[idx:idx] = split
    # …затем равномерно вставляем страницы-цитаты (без пустых рамок, которые испортили бы печать)
    missing = min_pages - len(pages)
    if missing > 0:
        step = (len(pages) + 1) / (missing + 1)
        for k in range(missing):
            at = min(len(pages), int(round(step * (k + 1))) + k)
            pages.insert(at, _page("text", [], caption=INTERLUDES[k % len(INTERLUDES)]))
    if len(pages) % 2:
        pages.append(_page("text", [], caption="Продолжение следует…"))
    _ = density
    return {"cover": _slot(cover), "pages": pages[:max_pages], "title": title}


def slot_dpi(photo: Photo, slot_w_cm: float, slot_h_cm: float, zoom: float = 1.0) -> int:
    slot_aspect = slot_w_cm / max(0.1, slot_h_cm)
    photo_aspect = photo.width / max(1, photo.height)
    used_w = photo.height * slot_aspect if photo_aspect > slot_aspect else photo.width
    used_w = used_w / max(1.0, zoom)
    return int(used_w / (slot_w_cm / 2.54))


def preflight(product: Product, options: dict[str, Any], layout: dict[str, Any],
              photos: dict[str, Photo]) -> dict[str, Any]:
    """Робот-ОТК: проверяет проект до заказа и объясняет проблемы человеческим языком."""
    issues: list[dict[str, Any]] = []
    pw, ph = page_size_cm(product, options)
    pages = layout.get("pages", [])
    specs = product.specs or {}
    pg = specs.get("pages") or {}
    used: dict[str, int] = {}

    def add(severity, code, title, message, page=None, slot=None, photo_id=None, fixes=None, extra=None):
        issues.append({"id": f"{code}-{page}-{slot}-{photo_id}", "severity": severity, "code": code,
                       "title": title, "message": message, "page": page, "slot": slot, "photo_id": photo_id,
                       "fixes": fixes or [], **(extra or {})})

    if product.kind == "book":
        if len(pages) < int(pg.get("min", 0)):
            add("critical", "too_few_pages", "Мало страниц",
                f"В этой книге минимум {pg.get('min')} страниц, сейчас {len(pages)}. Добавьте фото — "
                f"Кот разложит их сам.", fixes=[{"action": "autofill", "label": "Добавить страницы"}])
        if len(pages) > int(pg.get("max", 999)):
            add("critical", "too_many_pages", "Слишком много страниц",
                f"Максимум — {pg.get('max')} страниц.", fixes=[{"action": "compact", "label": "Уплотнить раскладку"}])
        cover = layout.get("cover") or {}
        if not cover.get("photo_id"):
            add("warning", "no_cover", "Нет фото на обложке", "Обложку видят первой — выберите яркий кадр.",
                fixes=[{"action": "auto_cover", "label": "Подобрать обложку"}])

    for pi, page in enumerate(pages):
        tpl = TEMPLATES.get(page.get("template"), TEMPLATES["full"])
        for si, slot in enumerate(page.get("slots", [])):
            pid = slot.get("photo_id")
            if not pid:
                add("critical", "empty_slot", "Пустое место на странице",
                    f"На странице {pi + 1} осталась пустая рамка — в печати она будет белой.",
                    page=pi, slot=si, fixes=[{"action": "fill_slot", "label": "Заполнить фото"},
                                             {"action": "change_template", "label": "Сменить шаблон"}])
                continue
            photo = photos.get(pid)
            if not photo:
                add("critical", "missing_photo", "Фото недоступно",
                    "Фото было удалено. Замените его.", page=pi, slot=si, photo_id=pid,
                    fixes=[{"action": "replace", "label": "Заменить"}])
                continue
            used[pid] = used.get(pid, 0) + 1
            if not tpl["slots"]:
                continue
            x, y, w, h = tpl["slots"][min(si, len(tpl["slots"]) - 1)]
            dpi = slot_dpi(photo, w * pw, h * ph, float(slot.get("crop", {}).get("zoom", 1.0)))
            if dpi < CRITICAL_DPI:
                add("critical", "low_dpi", "Фото напечатается нечётко",
                    f"Для рамки {w * pw:.0f}×{h * ph:.0f} см у кадра всего {dpi} dpi (норма — {RECOMMENDED_DPI}). "
                    f"Будет видна «пикселизация».", page=pi, slot=si, photo_id=pid,
                    fixes=[{"action": "upscale", "label": "Улучшить AI ×4"},
                           {"action": "smaller_template", "label": "Поставить меньше"},
                           {"action": "replace", "label": "Заменить"}], extra={"dpi": dpi})
            elif dpi < WARNING_DPI:
                add("warning", "low_dpi", "Разрешение ниже нормы",
                    f"{dpi} dpi при норме {RECOMMENDED_DPI}. Скорее всего, будет немного мягко.",
                    page=pi, slot=si, photo_id=pid,
                    fixes=[{"action": "upscale", "label": "Улучшить AI ×2"},
                           {"action": "ignore", "label": "Оставить как есть"}], extra={"dpi": dpi})
            if sharpness_norm(photo.sharpness) < 0.12:
                add("warning", "blurry", "Кадр размыт",
                    "Похоже на смаз или промах фокуса. Можно повысить резкость или заменить кадр.",
                    page=pi, slot=si, photo_id=pid,
                    fixes=[{"action": "text_clarity", "label": "Повысить резкость"},
                           {"action": "replace", "label": "Заменить"}, {"action": "ignore", "label": "Оставить"}])
            if photo.brightness < 45:
                add("info", "dark", "Тёмный кадр",
                    "В печати тени станут ещё глубже. Предлагаю мягко осветлить.", page=pi, slot=si, photo_id=pid,
                    fixes=[{"action": "auto_enhance", "label": "Осветлить AI"}, {"action": "ignore", "label": "Оставить"}])
    for pid, count in used.items():
        if count > 1:
            add("info", "repeated", "Фото повторяется",
                f"Этот кадр встречается в книге {count} раза. Так задумано?", photo_id=pid,
                fixes=[{"action": "ignore", "label": "Да, так и нужно"}])
    order = {"critical": 0, "warning": 1, "info": 2}
    issues.sort(key=lambda i: order[i["severity"]])
    critical = sum(1 for i in issues if i["severity"] == "critical")
    warnings = sum(1 for i in issues if i["severity"] == "warning")
    score = max(0, 100 - critical * 18 - warnings * 6 - (len(issues) - critical - warnings) * 2)
    return {"ok": critical == 0, "score": score, "critical": critical, "warnings": warnings, "issues": issues,
            "page_size_cm": [pw, ph], "pages": len(pages), "photos": len(used)}
