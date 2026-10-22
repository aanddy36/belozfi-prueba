import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, Header, Request
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.session import get_db
from app.shared.models.idempotency_key import IdempotencyKey

# Si una key queda en "processing" más que esto, se asume abandonada (ej. un error de
# validación de Pydantic que ocurre antes de que el controller pueda liberarla en su
# try/except) y se permite un reintento limpio. La limpieza periódica real de keys viejas
# es un job asíncrono fuera de alcance de este MVP (infra.md, 2.2.5) — esto es solo la
# salvaguarda que evita que una key quede bloqueada para siempre.
PROCESSING_TIMEOUT = timedelta(seconds=30)


async def require_idempotency_key(
    request: Request,
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
) -> dict:
    if not idempotency_key:
        raise AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "Falta el header Idempotency-Key")

    body = await request.body()
    request_hash = hashlib.sha256(body).hexdigest()
    endpoint = request.url.path

    if _try_insert_key(db, idempotency_key, endpoint, request_hash):
        return {"key": idempotency_key}

    existing = db.query(IdempotencyKey).filter_by(key=idempotency_key).first()

    if existing.status == "completed":
        if existing.request_hash == request_hash:
            return {"cached_response": existing.response_body}
        raise AppError(409, "IDEMPOTENCY_KEY_CONFLICT", "La Idempotency-Key ya se usó con un body distinto")

    # status == "processing": puede ser un reintento concurrente genuino, o una key huérfana
    # de un intento anterior que nunca se completó ni se liberó.
    if existing.created_at >= datetime.now(timezone.utc) - PROCESSING_TIMEOUT:
        raise AppError(409, "IDEMPOTENCY_KEY_CONFLICT", "La Idempotency-Key ya está siendo procesada")

    db.query(IdempotencyKey).filter_by(key=idempotency_key).delete()
    db.commit()
    _try_insert_key(db, idempotency_key, endpoint, request_hash)
    return {"key": idempotency_key}


def _try_insert_key(db: Session, key: str, endpoint: str, request_hash: str) -> bool:
    stmt = (
        pg_insert(IdempotencyKey)
        .values(key=key, endpoint=endpoint, request_hash=request_hash, status="processing")
        .on_conflict_do_nothing(index_elements=["key"])
    )
    result = db.execute(stmt)
    db.commit()
    return result.rowcount > 0


def complete_idempotency_key(db: Session, key: str, response_body: dict) -> None:
    db.query(IdempotencyKey).filter_by(key=key).update({"status": "completed", "response_body": response_body})
    db.commit()


def release_idempotency_key(db: Session, key: str) -> None:
    db.query(IdempotencyKey).filter_by(key=key).delete()
    db.commit()
