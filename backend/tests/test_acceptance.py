"""Приёмочные тесты трека 2 (раздел 6.4 ТЗ) и общих требований (раздел 4)."""
from __future__ import annotations

import io
import os
import tempfile
import uuid

import pytest
from PIL import Image, ImageFilter

_tmp = tempfile.mkdtemp(prefix="picpac-test-")
os.environ["DATA_DIR"] = _tmp
os.environ["DEMO_SIMULATOR"] = "0"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _jpeg(w=2400, h=1600, blur=0, color=(200, 120, 60)) -> bytes:
    import numpy as np
    rng = np.random.default_rng(w + h + blur)
    arr = np.clip(rng.normal(0, 30, (h, w, 3)) + np.array(color), 0, 255).astype("uint8")
    img = Image.fromarray(arr)
    if blur:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    return buf.getvalue()


def _guest(client):
    r = client.post("/api/auth/guest")
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_catalog_from_api(client):
    r = client.get("/api/catalog")
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) >= 5
    assert all("base_price_minor" in p and p["currency"] == "BYN" for p in items)


def test_full_path_with_10_photos_order_and_idempotency(client):
    h = _guest(client)
    files = [("files", (f"p{i}.jpg", _jpeg(color=(40 + i * 20, 120, 200 - i * 10)), "image/jpeg")) for i in range(12)]
    up = client.post("/api/photos", files=files, headers=h)
    assert up.status_code == 200, up.text
    ids = [p["id"] for p in up.json()["photos"]]
    assert len(ids) == 12
    pr = client.post("/api/projects", json={"product_id": "book-premium", "photo_ids": ids}, headers=h)
    assert pr.status_code == 200, pr.text
    project = pr.json()
    # порядок сохраняется после повторного открытия
    layout = project["layout"]
    layout["pages"] = list(reversed(layout["pages"]))
    order_before = [s["photo_id"] for pg in layout["pages"] for s in pg["slots"]]
    sv = client.put(f"/api/projects/{project['id']}", json={"layout": layout, "revision": project["revision"]}, headers=h)
    assert sv.status_code == 200
    again = client.get(f"/api/projects/{project['id']}", headers=h).json()
    assert [s["photo_id"] for pg in again["layout"]["pages"] for s in pg["slots"]] == order_before
    # конфликт версий
    stale = client.put(f"/api/projects/{project['id']}", json={"layout": layout, "revision": project["revision"]},
                       headers=h)
    assert stale.status_code == 409
    pf = client.get(f"/api/projects/{project['id']}/preflight", headers=h).json()
    assert pf["critical"] == 0, pf
    key = uuid.uuid4().hex
    body = {"project_id": project["id"], "delivery_method": "pickup", "promo_code": "PICPAC10", "accept_warnings": True}
    o1 = client.post("/api/orders", json=body, headers={**h, "Idempotency-Key": key})
    assert o1.status_code == 200, o1.text
    o2 = client.post("/api/orders", json=body, headers={**h, "Idempotency-Key": key})
    assert o2.status_code == 200 and o2.json()["replayed"] is True
    assert o1.json()["id"] == o2.json()["id"]
    assert o1.json()["discount_minor"] > 0
    mine = client.get("/api/orders", headers=h).json()["items"]
    assert len(mine) == 1
    # обращение по заказу и его видимость в карточке заказа
    t = client.post("/api/support", json={"order_id": o1.json()["id"], "text": "Когда будет готово?"}, headers=h)
    assert t.status_code == 200
    detail = client.get(f"/api/orders/{o1.json()['id']}", headers=h).json()
    assert detail["status"] == "accepted" and len(detail["tickets"]) == 1 and detail["events"]


def test_quality_warning_and_bad_format(client):
    h = _guest(client)
    up = client.post("/api/photos", files=[("files", ("tiny.jpg", _jpeg(300, 200), "image/jpeg")),
                                           ("files", ("doc.txt", b"hello", "text/plain"))], headers=h)
    rej = up.json()["rejected"]
    assert len(rej) == 2 and all(r["reason"] for r in rej)
    small = client.post("/api/photos", files=[("files", ("small.jpg", _jpeg(640, 480), "image/jpeg"))], headers=h)
    pid = small.json()["photos"][0]["id"]
    pr = client.post("/api/projects", json={"product_id": "canvas", "photo_ids": [pid], "options": {"size": "60x90"}},
                     headers=h).json()
    pf = client.get(f"/api/projects/{pr['id']}/preflight", headers=h).json()
    codes = {i["code"] for i in pf["issues"]}
    assert "low_dpi" in codes
    issue = next(i for i in pf["issues"] if i["code"] == "low_dpi")
    assert "dpi" in issue["message"] and issue["fixes"]


def test_price_recalculation(client):
    base = client.post("/api/quote", json={"product_id": "book-premium", "pages": 20, "photos": 20}).json()
    more = client.post("/api/quote", json={"product_id": "book-premium", "pages": 30, "photos": 20,
                                           "quantity": 2, "delivery_method": "courier"}).json()
    assert more["total_minor"] > base["total_minor"]
    promo = client.post("/api/quote", json={"product_id": "book-premium", "pages": 20, "photos": 20,
                                            "promo_code": "PICPAC10"}).json()
    assert promo["discount_minor"] == round(base["subtotal_minor"] * 0.1)


def test_roles_are_enforced_server_side(client):
    h = _guest(client)
    assert client.get("/api/admin/overview", headers=h).status_code == 403
    op = client.post("/api/auth/login", json={"email": "operator@picpac.test", "password": "operator1234"}).json()
    oh = {"Authorization": f"Bearer {op['token']}"}
    assert client.get("/api/admin/overview", headers=oh).status_code == 200
    assert client.get("/api/admin/ai", headers=oh).status_code == 403  # только админ
    ad = client.post("/api/auth/login", json={"email": "admin@picpac.test", "password": "admin1234"}).json()
    ah = {"Authorization": f"Bearer {ad['token']}"}
    audit = client.get("/api/admin/audit?result=denied", headers=ah).json()["items"]
    assert any(a["action"] == "access_denied" for a in audit)


def test_ai_tool_and_fallback(client):
    ad = client.post("/api/auth/login", json={"email": "admin@picpac.test", "password": "admin1234"}).json()
    ah = {"Authorization": f"Bearer {ad['token']}"}
    # переключаем «Магию» на недоступный провайдер → должен сработать встроенный фолбэк
    client.put("/api/admin/ai/providers/vllm", json={"enabled": True, "base_url": "http://127.0.0.1:9"}, headers=ah)
    r = client.put("/api/admin/ai/tools/auto_enhance", json={"provider_id": "vllm"}, headers=ah)
    assert r.status_code == 200
    h = _guest(client)
    pid = client.post("/api/photos", files=[("files", ("a.jpg", _jpeg(1600, 1200, blur=3), "image/jpeg"))],
                      headers=h).json()["photos"][0]["id"]
    res = client.post(f"/api/ai/photos/{pid}/apply", json={"tool": "auto_enhance"}, headers=h)
    assert res.status_code == 200, res.text
    assert res.json()["ai"]["status"] == "fallback"
    client.put("/api/admin/ai/tools/auto_enhance", json={"provider_id": "builtin"}, headers=ah)
    plan = client.post("/api/ai/command", json={"text": "сделай теплее и убери 3-ю страницу"}, headers=h).json()
    types = {a["type"] for a in plan["actions"]}
    assert "photo_tool" in types and "layout" in types


def test_delete_account_removes_photos(client):
    h = _guest(client)
    client.post("/api/photos", files=[("files", ("a.jpg", _jpeg(1200, 900), "image/jpeg"))], headers=h)
    r = client.delete("/api/auth/me", headers=h)
    assert r.status_code == 200 and r.json()["photos_deleted"] == 1
    assert client.get("/api/auth/me", headers=h).status_code == 401


def test_telegram_optional_link_and_status_messages(client, monkeypatch):
    """Бот необязателен: без токена всё работает; после /start <код> клиент получает этапы заказа."""
    import time
    from types import SimpleNamespace

    from app import services, telegram
    from app.db import SessionLocal
    from app.models import AppSetting

    h = _guest(client)
    st = client.get("/api/telegram/me", headers=h).json()
    assert st["configured"] is False and st["linked"] is False
    assert client.post("/api/telegram/me", json={"username": "bad nick!"}, headers=h).status_code == 422

    sent: list[dict] = []

    def fake_call(token, method, http_timeout=10, **params):
        if method == "sendMessage":
            sent.append(params)
            return {"message_id": len(sent)}
        return [] if method == "getUpdates" else {"username": "picpac_test_bot"}

    monkeypatch.setattr(telegram, "call", fake_call)
    with SessionLocal() as db:
        db.add(AppSetting(key="telegram_token", value="123456:" + "A" * 35))
        db.add(AppSetting(key="telegram_bot_username", value="picpac_test_bot"))
        db.commit()

    st = client.post("/api/telegram/me", json={"username": "@ann_test"}, headers=h).json()
    assert st["configured"] and st["requested"] and not st["linked"]
    code = st["link"].split("start=")[1]
    telegram._handle({"message": {"text": f"/start {code}", "chat": {"id": 555}, "from": {"first_name": "Ann"}}}, "tok")
    st = client.get("/api/telegram/me", headers=h).json()
    assert st["linked"] and st["enabled"]

    me = client.get("/api/auth/me", headers=h).json()
    uid = me.get("id") or me["user"]["id"]
    with SessionLocal() as db:
        services.notify(db, uid, "Заказ PP-1: Печать", "Печатаем!")
        db.commit()
    for _ in range(40):
        if any("Печать" in m.get("text", "") for m in sent):
            break
        time.sleep(0.05)
    assert any(m["chat_id"] == "555" and "Печать" in m["text"] for m in sent)

    order = SimpleNamespace(eta=None, delivery_method="pickup", track_number=None)
    assert "готов к выдаче" in services.order_telegram_text(order, "shipped", None, "")
    order = SimpleNamespace(eta=None, delivery_method="courier", track_number="BY1PP")
    assert "BY1PP" in services.order_telegram_text(order, "shipped", None, "")

    telegram._handle({"message": {"text": "/stop", "chat": {"id": 555}}}, "tok")
    assert client.get("/api/telegram/me", headers=h).json()["enabled"] is False
    with SessionLocal() as db:
        for k in ("telegram_token", "telegram_bot_username"):
            db.delete(db.get(AppSetting, k))
        db.commit()


def test_drafts_keep_rename_and_clear(client):
    """Черновики: «сохранить» защищает от очистки, переименование, очистка удаляет только несохранённые."""
    h = _guest(client)
    up = client.post("/api/photos", files=[("files", ("d.jpg", _jpeg(1600, 1200), "image/jpeg"))], headers=h).json()
    pid = up["photos"][0]["id"]
    a = client.post("/api/projects", json={"product_id": "mug", "photo_ids": [pid]}, headers=h).json()
    b = client.post("/api/projects", json={"product_id": "mug", "photo_ids": [pid]}, headers=h).json()
    r = client.post(f"/api/projects/{a['id']}/meta", json={"keep": True, "title": "Кружка маме"}, headers=h)
    assert r.status_code == 200 and r.json()["kept"] is True and r.json()["title"] == "Кружка маме"
    cleared = client.delete("/api/projects", headers=h).json()
    assert cleared["deleted"] == 1 and cleared["ids"] == [b["id"]]
    ids = [p["id"] for p in client.get("/api/projects", headers=h).json()["items"]]
    assert a["id"] in ids and b["id"] not in ids
    assert any(p["id"] == pid for p in client.get("/api/photos", headers=h).json()["photos"])  # фото остались
    other = _guest(client)
    assert client.post(f"/api/projects/{a['id']}/meta", json={"keep": False}, headers=other).status_code in (403, 404)


def test_page_text_is_editable_and_sanitized(client):
    """Текст на страницах: подпись и оформление сохраняются, лишние поля и опасные значения отбрасываются."""
    h = _guest(client)
    up = client.post("/api/photos", files=[("files", ("t.jpg", _jpeg(1600, 1200), "image/jpeg"))], headers=h).json()
    p = client.post("/api/projects", json={"product_id": "book-classic", "photo_ids": [up["photos"][0]["id"]]}, headers=h).json()
    layout = p["layout"]
    layout["pages"][0]["caption"] = "Лето у бабушки" + "!" * 400
    layout["pages"][0]["text"] = {"font": "script", "size": 9, "color": "#DD5757", "align": "left", "upper": True, "pos": "top",
                                  "evil": "<script>", "font_url": "http://x"}
    layout["title_style"] = {"font": "comic", "color": "red", "size": 1.2}
    r = client.put(f"/api/projects/{p['id']}", json={"layout": layout, "revision": p["revision"], "title": "Наша история"}, headers=h)
    assert r.status_code == 200
    saved = client.get(f"/api/projects/{p['id']}", headers=h).json()
    pg = saved["layout"]["pages"][0]
    assert pg["caption"].startswith("Лето у бабушки") and len(pg["caption"]) == 300
    assert pg["text"] == {"font": "script", "size": 2.5, "color": "#DD5757", "align": "left", "pos": "top", "upper": True}
    assert saved["layout"]["title_style"] == {"size": 1.2} and saved["title"] == "Наша история"


def test_voice_status_reports_engine(client):
    r = client.get("/api/voice/status").json()
    assert set(r) >= {"server", "engine", "rate"} and r["rate"] == 16000
