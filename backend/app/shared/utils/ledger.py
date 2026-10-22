from uuid import UUID

from sqlalchemy.orm import Session

from app.shared.models.ledger_entry import LedgerEntry


def record_ledger_entry(
    db: Session,
    account_id: UUID,
    entry_type: str,
    amount_cents: int,
    reference_type: str,
    reference_id: UUID,
) -> None:
    db.add(
        LedgerEntry(
            account_id=account_id,
            entry_type=entry_type,
            amount_cents=amount_cents,
            reference_type=reference_type,
            reference_id=reference_id,
        )
    )
