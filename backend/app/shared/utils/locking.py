from uuid import UUID

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.modules.accounts.model import Account


def lock_account_by_user(db: Session, user_id: UUID) -> Account:
    account = (
        db.query(Account)
        .filter_by(user_id=user_id)
        .filter(Account.status != "closed")
        .with_for_update()
        .first()
    )
    if not account:
        raise AppError(404, "ACCOUNT_NOT_FOUND", "No existe una cuenta para este usuario")
    return account
