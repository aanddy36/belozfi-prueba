from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.responses import success_response
from app.db.session import get_db
from app.modules.accounts import service as accounts_service
from app.modules.accounts.schema import CreateAccountRequest
from app.shared.utils.current_user import get_current_user
from app.shared.utils.idempotency import (
    complete_idempotency_key,
    release_idempotency_key,
    require_idempotency_key,
)


async def get_me(db: Session = Depends(get_db)):
    user = get_current_user(db)
    result = accounts_service.get_account_me(db, user.id)
    if result is None:
        return success_response(data=None, message="No account yet")

    data = {
        "account": {
            "status": result["account"].status,
            "credit_limit_cents": result["account"].credit_limit_cents,
            "available_credit_cents": result["account"].available_credit_cents,
            "collateral_cents": result["account"].collateral_cents,
        },
        "card": {"status": result["card"].status, "display_status": result["display_status"]},
        "current_debt_cents": result["current_debt_cents"],
        "statement_date": result["statement_date"].isoformat(),
        "payment_due_date": result["payment_due_date"].isoformat(),
        "minimum_payment_cents": result["minimum_payment_cents"],
    }
    return success_response(data=data, message="Account retrieved successfully")


async def create_account(
    payload: CreateAccountRequest,
    idem: dict = Depends(require_idempotency_key),
    db: Session = Depends(get_db),
):
    if "cached_response" in idem:
        return success_response(data=idem["cached_response"], message="Account created successfully")
    try:
        user = get_current_user(db)
        account = accounts_service.create_account(db, user.id, payload.deposit_amount_cents)
        data = {"id": str(account.id), "status": account.status}
        complete_idempotency_key(db, idem["key"], data)
        return success_response(data=data, message="Account created successfully")
    except Exception:
        release_idempotency_key(db, idem["key"])
        raise


async def close_account(
    idem: dict = Depends(require_idempotency_key),
    db: Session = Depends(get_db),
):
    if "cached_response" in idem:
        return success_response(data=idem["cached_response"], message="Account closed successfully")
    try:
        user = get_current_user(db)
        account = accounts_service.close_account(db, user.id)
        data = {"id": str(account.id), "status": account.status}
        complete_idempotency_key(db, idem["key"], data)
        return success_response(data=data, message="Account closed successfully")
    except Exception:
        release_idempotency_key(db, idem["key"])
        raise
