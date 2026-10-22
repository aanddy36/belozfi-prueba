from typing import Any

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse


def success_response(data: Any = None, message: str = "OK", status_code: int = 200) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder({"statusCode": status_code, "message": message, "data": data}),
    )
