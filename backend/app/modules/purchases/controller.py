from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.responses import success_response
from app.db.session import get_db
from app.modules.purchases import service as purchases_service
from app.modules.purchases.schema import CreatePurchaseRequest
from app.shared.utils.current_user import get_current_user
from app.shared.utils.idempotency import (
    complete_idempotency_key,
    release_idempotency_key,
    require_idempotency_key,
)


async def create_purchase(
    payload: CreatePurchaseRequest,
    idem: dict = Depends(require_idempotency_key),
    db: Session = Depends(get_db),
):
    if "cached_response" in idem:
        return success_response(data=idem["cached_response"], message="Purchase created successfully")
    try:
        user = get_current_user(db)
        purchase = purchases_service.create_purchase(
            db, user.id, payload.merchant_name, payload.amount_cents, payload.installment_plan
        )
        data = {
            "id": str(purchase.id),
            "merchant_name": purchase.merchant_name,
            "amount_cents": purchase.amount_cents,
            "installment_plan": purchase.installment_plan,
            "status": purchase.status,
        }
        complete_idempotency_key(db, idem["key"], data)
        return success_response(data=data, message="Purchase created successfully")
    except Exception:
        release_idempotency_key(db, idem["key"])
        raise
