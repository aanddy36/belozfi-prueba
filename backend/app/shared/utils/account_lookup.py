from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.modules.accounts.model import Account


def find_account_by_user(db: Session, user_id: UUID) -> Optional[Account]:
    """La cuenta vigente del usuario — excluye cuentas `closed`.

    Al no haber un constraint UNIQUE en accounts.user_id (Spec 1), un usuario puede
    tener más de una fila de `accounts` a lo largo del tiempo (crear -> cancelar ->
    crear de nuevo). Esta función es la única fuente de verdad de "cuál es la cuenta
    actual" en todo el backend — una cuenta `closed` queda invisible para que el
    usuario pueda volver a crear una tarjeta nueva (Spec 6).
    """
    return db.query(Account).filter_by(user_id=user_id).filter(Account.status != "closed").first()
