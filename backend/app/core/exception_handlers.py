from typing import Any, Optional

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app.core.errors import AppError


def _error_response(status_code: int, message: str, code: str, details: Optional[Any] = None) -> JSONResponse:
    error = {"code": code}
    if details is not None:
        error["details"] = details
    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder({"statusCode": status_code, "message": message, "error": error}),
    )


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return _error_response(exc.status_code, exc.message, exc.code, exc.details)


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    details = [
        {"field": ".".join(str(p) for p in err["loc"] if p != "body"), "message": err["msg"]}
        for err in exc.errors()
    ]
    return _error_response(422, "Validation error", "VALIDATION_ERROR", details)


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return _error_response(exc.status_code, str(exc.detail), "HTTP_ERROR")


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return _error_response(500, "Internal server error", "INTERNAL_SERVER_ERROR")


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
