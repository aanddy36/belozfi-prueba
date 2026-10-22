from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.responses import success_response
from app.db.session import get_db
from app.modules.collateral import service as collateral_service
from app.modules.collateral.schema import CreateCollateralDepositRequest
from app.shared.utils.current_user import get_current_user
from app.shared.utils.idempotency import (
    complete_idempotency_key,
    release_idempotency_key,
    require_idempotency_key,
)


async def create_collateral_deposit(
    payload: CreateCollateralDepositRequest,
    idem: dict = Depends(require_idempotency_key),
    db: Session = Depends(get_db),
):
    if "cached_response" in idem:
        return success_response(data=idem["cached_response"], message="Collateral deposit created successfully")
    try:
        user = get_current_user(db)
        deposit = collateral_service.create_collateral_deposit(db, user.id, payload.amount_cents)
        data = {"id": str(deposit.id), "amount_cents": deposit.amount_cents, "status": deposit.status}
        complete_idempotency_key(db, idem["key"], data)
        return success_response(data=data, message="Collateral deposit created successfully")
    except Exception:
        release_idempotency_key(db, idem["key"])
        raise


async def list_collateral_deposits(db: Session = Depends(get_db)):
    user = get_current_user(db)
    deposits = collateral_service.list_collateral_deposits(db, user.id)
    data = [
        {
            "id": str(d.id),
            "amount_cents": d.amount_cents,
            "status": d.status,
            "requested_at": d.requested_at.isoformat(),
            "confirmed_at": d.confirmed_at.isoformat() if d.confirmed_at else None,
        }
        for d in deposits
    ]
    return success_response(data=data, message="Collateral deposits retrieved successfully")
