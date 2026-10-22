from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.modules.accounts.model import Account

_UNION_QUERY = text(
    """
    SELECT 'purchase' AS type, merchant_name, -amount_cents AS amount_cents, authorized_at AS date
    FROM purchases WHERE account_id = :account_id
    UNION ALL
    SELECT 'payment' AS type, NULL AS merchant_name, amount_cents, applied_at AS date
    FROM payments WHERE account_id = :account_id
    ORDER BY date DESC
    LIMIT :limit OFFSET :offset
    """
)

_COUNT_QUERY = text(
    """
    SELECT
        (SELECT count(*) FROM purchases WHERE account_id = :account_id) +
        (SELECT count(*) FROM payments WHERE account_id = :account_id)
    """
)


def list_transactions(db: Session, user_id: UUID, page: int, page_size: int) -> dict:
    account = db.query(Account).filter_by(user_id=user_id).first()
    if not account:
        raise AppError(404, "ACCOUNT_NOT_FOUND", "No existe una cuenta para este usuario")

    offset = (page - 1) * page_size
    rows = (
        db.execute(_UNION_QUERY, {"account_id": account.id, "limit": page_size, "offset": offset})
        .mappings()
        .all()
    )
    total = db.execute(_COUNT_QUERY, {"account_id": account.id}).scalar()

    items = [
        {
            "type": row["type"],
            "merchant_name": row["merchant_name"],
            "amount_cents": row["amount_cents"],
            "date": row["date"].isoformat(),
        }
        for row in rows
    ]
    return {"items": items, "total": total}
