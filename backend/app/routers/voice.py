"""Голосовой ввод: распознавание русской речи на своём сервере (Vosk, офлайн, без облака).

Клиент открывает WebSocket /api/voice/ws, первым сообщением шлёт {"token": ...}, затем — аудио
16 кГц, 16 бит, моно (двоичные кадры). Сервер в ответ стримит {"final", "partial"} — текст
появляется в поле ввода по мере речи. Сообщение "stop" завершает распознавание и возвращает
итог с "done": true. Ничего не отправляется Коту автоматически — пользователь сам читает и жмёт «Отправить»."""
from __future__ import annotations

import json
import threading
from typing import Any, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool

from ..config import MODELS_DIR
from ..db import SessionLocal
from ..models import User
from ..security import _decode

router = APIRouter(tags=["voice"])

VOSK_DIR = MODELS_DIR / "vosk-model-small-ru-0.22"
RATE = 16000
MAX_SECONDS = 90
_model: Any = None
_lock = threading.Lock()


def available() -> bool:
    try:
        import vosk  # noqa: F401
    except Exception:
        return False
    return (VOSK_DIR / "am").exists() or (VOSK_DIR / "conf").exists()


def _get_model() -> Any:
    global _model
    with _lock:
        if _model is None:
            import vosk
            vosk.SetLogLevel(-1)
            _model = vosk.Model(str(VOSK_DIR))
        return _model


@router.get("/api/voice/status")
def status() -> dict[str, Any]:
    return {"server": available(), "engine": "Vosk · vosk-model-small-ru-0.22", "rate": RATE, "max_seconds": MAX_SECONDS}


def _user_ok(token: Optional[str]) -> bool:
    uid = _decode(token or "")
    if not uid:
        return False
    with SessionLocal() as db:
        return db.get(User, uid) is not None


@router.websocket("/api/voice/ws")
async def stream(ws: WebSocket) -> None:
    await ws.accept()
    try:
        init = json.loads(await ws.receive_text())
    except Exception:
        await ws.close(code=1008)
        return
    if not _user_ok(init.get("token")):
        await ws.send_json({"error": "auth", "message": "Нужно войти или продолжить как гость"})
        await ws.close(code=1008)
        return
    if not available():
        await ws.send_json({"error": "unavailable", "message": "Модель распознавания речи не установлена на сервере"})
        await ws.close()
        return
    import vosk
    rec = vosk.KaldiRecognizer(await run_in_threadpool(_get_model), RATE)
    parts: list[str] = []
    last = ""
    received = 0
    await ws.send_json({"ready": True})
    try:
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                return
            data = msg.get("bytes")
            if data:
                received += len(data)
                if await run_in_threadpool(rec.AcceptWaveform, data):
                    t = json.loads(rec.Result()).get("text", "").strip()
                    if t:
                        parts.append(t)
                    partial = ""
                else:
                    partial = json.loads(rec.PartialResult()).get("partial", "").strip()
                cur = " ".join(parts + ([partial] if partial else []))
                if cur != last:
                    last = cur
                    await ws.send_json({"final": " ".join(parts), "partial": partial})
                if received > RATE * 2 * MAX_SECONDS:
                    msg = {"text": "stop"}
                else:
                    continue
            if msg.get("text") == "stop":
                t = json.loads(await run_in_threadpool(rec.FinalResult)).get("text", "").strip()
                if t:
                    parts.append(t)
                await ws.send_json({"final": " ".join(parts), "partial": "", "done": True})
                await ws.close()
                return
    except WebSocketDisconnect:
        return
