from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.modules.accounts.model import Account
from app.modules.cards.model import Card
from app.modules.collateral.model import CollateralDeposit
from app.shared.utils.ledger import record_ledger_entry

CONFIRMATION_DELAY = timedelta(seconds=10)


def confirm_pending_deposits(db: Session, account_id: UUID) -> None:
    cutoff = datetime.now(timezone.utc) - CONFIRMATION_DELAY
    pending = (
        db.query(CollateralDeposit)
        .filter(
            CollateralDeposit.account_id == account_id,
            CollateralDeposit.status == "pending",
            CollateralDeposit.requested_at <= cutoff,
        )
        .all()
    )
    if not pending:
        return

    account = db.query(Account).filter_by(id=account_id).with_for_update().first()
    card = db.query(Card).filter_by(account_id=account_id).first()
    is_first_confirmation = account.status == "pending_collateral"

    for deposit in pending:
        deposit.status = "confirmed"
        deposit.confirmed_at = datetime.now(timezone.utc)
        account.collateral_cents += deposit.amount_cents
        account.credit_limit_cents += deposit.amount_cents
        account.available_credit_cents += deposit.amount_cents
        record_ledger_entry(
            db, account_id, "collateral_deposit", deposit.amount_cents, "collateral_deposit", deposit.id
        )

    if is_first_confirmation:
        account.status = "active"
        card.status = "active"
        card.activated_at = datetime.now(timezone.utc)

    db.commit()
