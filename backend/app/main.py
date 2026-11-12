from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import errors, simulator
from . import telegram as tg_bot
from .config import CORS_ORIGINS, SEED_ON_START
from .db import Base, engine
from .routers import admin, ai, auth, catalog, dbadmin, misc, orders, photos, pipeline, projects, telegram, themes, voice

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    if SEED_ON_START:
        from .seed.seed import run
        run()
    task = asyncio.create_task(simulator.loop())
    bot = asyncio.create_task(tg_bot.loop())
    yield
    task.cancel()
    bot.cancel()


app = FastAPI(title="picPac API", version="1.0.0", lifespan=lifespan,
              description="Мобильный канал заказа фотопродукции picPac.by: каталог, проекты, AI-обработка, "
                          "заказы, поддержка и админка. Все суммы — в копейках BYN, даты — ISO 8601 с часовым поясом.")
errors.install(app)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"],
                   expose_headers=["X-AI-Provider", "X-AI-Status", "X-AI-Duration"])

for r in (auth.router, catalog.router, photos.router, projects.router, orders.router, ai.router, admin.router,
          themes.router, pipeline.router, dbadmin.router, telegram.router, voice.router,
          misc.router):
    app.include_router(r)

# Если рядом лежит собранный фронтенд — отдаём его (режим «одного процесса» без nginx)
STATIC = Path(os.getenv("STATIC_DIR", Path(__file__).resolve().parents[2] / "frontend" / "dist"))
if STATIC.exists():
    app.mount("/assets", StaticFiles(directory=STATIC / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = STATIC / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(STATIC / "index.html")
