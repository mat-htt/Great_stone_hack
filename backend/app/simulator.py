"""Демо-симулятор производства: продвигает реальные (не синтетические) заказы по этапам,
как это делают сканеры штрих-кодов на линии. Включается/выключается в админке."""
from __future__ import annotations

import asyncio
import logging

from .config import DEMO_SIMULATOR
from datetime import timedelta

from .db import SessionLocal, utcnow
from .models import Order, User
from .services import next_step, set_status

log = logging.getLogger("picpac.simulator")
_state = {"enabled": DEMO_SIMULATOR, "interval": 25, "ticks": 0}


def state() -> dict:
    return dict(_state)


def configure(enabled: bool, interval: int) -> None:
    _state["enabled"] = enabled
    _state["interval"] = interval


def tick() -> int:
    db = SessionLocal()
    moved = 0
    try:
        fresh = utcnow() - timedelta(hours=6)  # демо-заказ из сидов остаётся «в производстве» для показа
        q = (db.query(Order).join(User, User.id == Order.user_id)
             .filter(User.is_synthetic.is_(False), Order.created_at >= fresh,
                     Order.status.notin_(["completed", "cancelled", "needs_fix"])))
        for o in q.all():
            nxt = next_step(o)
            if nxt:
                set_status(db, o, nxt[0], nxt[1], "Линия picPac (сканер)")
                moved += 1
        db.commit()
    except Exception:  # pragma: no cover
        log.exception("simulator tick failed")
        db.rollback()
    finally:
        db.close()
    _state["ticks"] += 1
    return moved


async def loop() -> None:
    while True:
        await asyncio.sleep(_state["interval"])
        if _state["enabled"]:
            await asyncio.to_thread(tick)
