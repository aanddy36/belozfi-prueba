from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.responses import success_response
from app.db.session import get_db
from app.modules.payments import service as payments_service
from app.modules.payments.schema import CreatePaymentRequest
from app.shared.utils.current_user import get_current_user
from app.shared.utils.idempotency import (
    complete_idempotency_key,
    release_idempotency_key,
    require_idempotency_key,
)


async def create_payment(
    payload: CreatePaymentRequest,
    idem: dict = Depends(require_idempotency_key),
    db: Session = Depends(get_db),
):
    if "cached_response" in idem:
        return success_response(data=idem["cached_response"], message="Payment created successfully")
    try:
        user = get_current_user(db)
        payment = payments_service.create_payment(db, user.id, payload.amount_cents)
        data = {"id": str(payment.id), "amount_cents": payment.amount_cents}
        complete_idempotency_key(db, idem["key"], data)
        return success_response(data=data, message="Payment created successfully")
    except Exception:
        release_idempotency_key(db, idem["key"])
        raise
