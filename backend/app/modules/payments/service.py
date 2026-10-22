from uuid import UUID

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.modules.payments.model import Payment, PaymentAllocation
from app.modules.purchases.model import Purchase
from app.shared.utils.ledger import record_ledger_entry
from app.shared.utils.locking import lock_account_by_user

MIN_PAYMENT_CENTS = 2_500  # $25, mismo piso que Spec 2


def create_payment(db: Session, user_id: UUID, amount_cents: int) -> Payment:
    account = lock_account_by_user(db, user_id)

    purchases = (
        db.query(Purchase)
        .filter(Purchase.account_id == account.id, Purchase.status == "active")
        .order_by(Purchase.authorized_at.asc())
        .all()
    )
    current_debt_cents = sum(p.pending_principal_cents + p.accrued_interest_cents for p in purchases)

    if amount_cents > current_debt_cents:
        raise AppError(409, "PAYMENT_EXCEEDS_DEBT", "El pago excede la deuda total")

    minimum_required = min(MIN_PAYMENT_CENTS, current_debt_cents)
    if amount_cents < minimum_required:
        raise AppError(409, "PAYMENT_BELOW_MINIMUM", "El pago es menor al mínimo permitido")

    payment = Payment(account_id=account.id, amount_cents=amount_cents)
    db.add(payment)
    db.flush()  # para tener payment.id

    remaining = amount_cents
    for purchase in purchases:
        if remaining <= 0:
            break
        purchase_balance = purchase.pending_principal_cents + purchase.accrued_interest_cents
        if purchase_balance <= 0:
            continue

        applied = min(remaining, purchase_balance)
        interest_paid = min(applied, purchase.accrued_interest_cents)
        principal_paid = applied - interest_paid

        purchase.accrued_interest_cents -= interest_paid
        purchase.pending_principal_cents -= principal_paid
        if purchase.pending_principal_cents == 0 and purchase.accrued_interest_cents == 0:
            purchase.status = "paid"

        db.add(PaymentAllocation(payment_id=payment.id, purchase_id=purchase.id, amount_cents=applied))
        account.available_credit_cents += principal_paid
        remaining -= applied

    record_ledger_entry(db, account.id, "payment", amount_cents, "payment", payment.id)

    db.commit()
    db.refresh(payment)
    return payment
