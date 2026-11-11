"""Единый формат ошибок API: {"error": {"code", "message", "details"}} (ОТ-05)."""
from __future__ import annotations

from typing import Any, Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: Optional[dict[str, Any]] = None):
        self.status = status
        self.code = code
        self.message = message
        self.details = details or {}


def _body(code: str, message: str, details: Optional[dict] = None) -> dict:
    return {"error": {"code": code, "message": message, "details": details or {}}}


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        return JSONResponse(status_code=exc.status, content=_body(exc.code, exc.message, exc.details))

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        fields = [".".join(str(p) for p in e["loc"][1:]) for e in exc.errors()]
        return JSONResponse(status_code=422, content=_body(
            "validation_error", "Проверьте заполнение полей", {"fields": fields}))

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        messages = {404: "Не найдено", 405: "Метод не поддерживается", 413: "Файл слишком большой"}
        return JSONResponse(status_code=exc.status_code, content=_body(
            f"http_{exc.status_code}", messages.get(exc.status_code, str(exc.detail))))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):  # pragma: no cover
        import logging
        logging.getLogger("picpac").exception("Unhandled error")
        return JSONResponse(status_code=500, content=_body(
            "internal_error", "Что-то пошло не так. Мы уже разбираемся — попробуйте ещё раз."))
