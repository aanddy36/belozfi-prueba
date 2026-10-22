from decimal import Decimal
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.modules.cards.model import Card
from app.modules.purchases.model import Purchase
from app.shared.utils.ledger import record_ledger_entry
from app.shared.utils.locking import lock_account_by_user

MONTHLY_RATE_FINANCED = Decimal("0.02")
MONTHLY_RATE_SINGLE = Decimal("0")


def create_purchase(
    db: Session, user_id: UUID, merchant_name: str, amount_cents: int, installment_plan: int
) -> Purchase:
    account = lock_account_by_user(db, user_id)
    card = db.query(Card).filter_by(account_id=account.id).first()

    if account.status != "active" or card.status != "active":
        raise AppError(409, "CARD_NOT_ACTIVE", "La tarjeta no está activa para realizar compras")

    if amount_cents > account.available_credit_cents:
        raise AppError(409, "INSUFFICIENT_CREDIT", "El monto excede el cupo disponible")

    monthly_rate = MONTHLY_RATE_SINGLE if installment_plan == 1 else MONTHLY_RATE_FINANCED

    purchase = Purchase(
        account_id=account.id,
        merchant_name=merchant_name,
        amount_cents=amount_cents,
        installment_plan=installment_plan,
        monthly_rate=monthly_rate,
        pending_principal_cents=amount_cents,
        accrued_interest_cents=0,
        status="active",
    )
    db.add(purchase)
    account.available_credit_cents -= amount_cents
    db.flush()  # para tener purchase.id antes de postear al ledger

    record_ledger_entry(db, account.id, "purchase", -amount_cents, "purchase", purchase.id)

    db.commit()
    db.refresh(purchase)
    return purchase
