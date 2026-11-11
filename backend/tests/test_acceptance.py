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
    pr = client.post("/api/projects", json={"product_id": "photobook-premium", "photo_ids": ids}, headers=h)
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
    base = client.post("/api/quote", json={"product_id": "photobook-premium", "pages": 20, "photos": 20}).json()
    more = client.post("/api/quote", json={"product_id": "photobook-premium", "pages": 30, "photos": 20,
                                           "quantity": 2, "delivery_method": "courier"}).json()
    assert more["total_minor"] > base["total_minor"]
    promo = client.post("/api/quote", json={"product_id": "photobook-premium", "pages": 20, "photos": 20,
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
