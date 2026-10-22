import secrets
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.modules.accounts.model import Account
from app.modules.cards.model import Card
from app.modules.collateral.model import CollateralDeposit
from app.modules.purchases.model import Purchase
from app.shared.utils.collateral_confirmation import confirm_pending_deposits
from app.shared.utils.ledger import record_ledger_entry
from app.shared.utils.locking import lock_account_by_user

MIN_DEPOSIT_CENTS = 100_000  # $1.000
MIN_PAYMENT_CENTS = 2_500  # $25
MIN_PAYMENT_RATE = Decimal("0.05")


def create_account(db: Session, user_id: UUID, deposit_amount_cents: int) -> Account:
    if deposit_amount_cents < MIN_DEPOSIT_CENTS:
        raise AppError(400, "VALIDATION_ERROR", "El depósito mínimo es de $1.000")

    if db.query(Account).filter_by(user_id=user_id).first():
        raise AppError(409, "ACCOUNT_ALREADY_EXISTS", "Ya existe una cuenta para este usuario")

    account = Account(user_id=user_id, status="pending_collateral")
    db.add(account)
    db.flush()  # para tener account.id antes de crear card/deposit (ver nota de Spec 1)

    card = Card(
        account_id=account.id,
        status="inactive",
        card_number=_generate_card_number(),
        exp_month=datetime.now(timezone.utc).month,
        exp_year=datetime.now(timezone.utc).year + 4,
        cvc=f"{secrets.randbelow(1000):03d}",
    )
    db.add(card)
    db.add(CollateralDeposit(account_id=account.id, amount_cents=deposit_amount_cents, status="pending"))

    db.commit()
    db.refresh(account)
    return account


def _generate_card_number() -> str:
    return "5" + "".join(str(secrets.randbelow(10)) for _ in range(15))


def get_account_me(db: Session, user_id: UUID) -> Optional[dict]:
    account = db.query(Account).filter_by(user_id=user_id).first()
    if not account:
        return None

    confirm_pending_deposits(db, account.id)
    db.refresh(account)
    card = db.query(Card).filter_by(account_id=account.id).first()

    current_debt_cents = (
        db.query(func.coalesce(func.sum(Purchase.pending_principal_cents + Purchase.accrued_interest_cents), 0))
        .filter(Purchase.account_id == account.id, Purchase.status == "active")
        .scalar()
    )

    today = datetime.now(timezone.utc).date()
    payment_due_date = _next_payment_due_date(today)
    statement_date = _add_months(payment_due_date, -1).replace(day=20)
    minimum_payment_cents = _minimum_payment(current_debt_cents)
    display_status = _resolve_display_status(account, card, current_debt_cents, payment_due_date, today)

    return {
        "account": account,
        "card": card,
        "display_status": display_status,
        "current_debt_cents": current_debt_cents,
        "statement_date": statement_date,
        "payment_due_date": payment_due_date,
        "minimum_payment_cents": minimum_payment_cents,
    }


def _next_payment_due_date(today: date) -> date:
    candidate = today.replace(day=10)
    return candidate if candidate >= today else _add_months(candidate, 1)


def _add_months(d: date, delta: int) -> date:
    month_index = d.month - 1 + delta
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    return d.replace(year=year, month=month)


def _minimum_payment(current_debt_cents: int) -> int:
    if current_debt_cents <= MIN_PAYMENT_CENTS:
        return current_debt_cents
    calculated = int((Decimal(current_debt_cents) * MIN_PAYMENT_RATE).to_integral_value(rounding=ROUND_HALF_UP))
    return max(calculated, MIN_PAYMENT_CENTS)


def _resolve_display_status(
    account: Account, card: Card, current_debt_cents: int, payment_due_date: date, today: date
) -> str:
    if account.status == "closed":
        return "Cancelled"
    if card.status == "inactive":
        return "Pending"
    if card.status == "frozen":
        return "Frozen"
    if today > payment_due_date and current_debt_cents > 0:
        return "Overdue"
    return "Active"


def close_account(db: Session, user_id: UUID) -> Account:
    account = lock_account_by_user(db, user_id)

    current_debt_cents = (
        db.query(func.coalesce(func.sum(Purchase.pending_principal_cents + Purchase.accrued_interest_cents), 0))
        .filter(Purchase.account_id == account.id, Purchase.status == "active")
        .scalar()
    )
    if current_debt_cents > 0:
        raise AppError(409, "OUTSTANDING_BALANCE", "No se puede cerrar la cuenta con deuda pendiente")

    if account.collateral_cents > 0:
        record_ledger_entry(db, account.id, "collateral_release", -account.collateral_cents, "account", account.id)
    account.collateral_cents = 0
    account.status = "closed"
    db.commit()
    db.refresh(account)
    return account
