from uuid import UUID

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.modules.collateral.model import CollateralDeposit
from app.shared.utils.account_lookup import find_account_by_user
from app.shared.utils.collateral_confirmation import confirm_pending_deposits

MIN_DEPOSIT_CENTS = 100_000  # $1.000, mismo piso que Spec 2


def create_collateral_deposit(db: Session, user_id: UUID, amount_cents: int) -> CollateralDeposit:
    if amount_cents < MIN_DEPOSIT_CENTS:
        raise AppError(400, "VALIDATION_ERROR", "El depósito mínimo es de $1.000")

    # Una cuenta `closed` es invisible para find_account_by_user (ver account_lookup.py) —
    # por eso ya no hace falta un chequeo aparte de "cuenta cerrada": da 404 directo.
    account = find_account_by_user(db, user_id)
    if not account:
        raise AppError(404, "ACCOUNT_NOT_FOUND", "No existe una cuenta para este usuario")

    deposit = CollateralDeposit(account_id=account.id, amount_cents=amount_cents, status="pending")
    db.add(deposit)
    db.commit()
    db.refresh(deposit)
    return deposit


def list_collateral_deposits(db: Session, user_id: UUID) -> list[CollateralDeposit]:
    account = find_account_by_user(db, user_id)
    if not account:
        raise AppError(404, "ACCOUNT_NOT_FOUND", "No existe una cuenta para este usuario")

    confirm_pending_deposits(db, account.id)

    return (
        db.query(CollateralDeposit)
        .filter_by(account_id=account.id)
        .order_by(CollateralDeposit.requested_at.desc())
        .all()
    )
