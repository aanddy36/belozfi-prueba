from uuid import UUID

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.modules.accounts.model import Account
from app.modules.cards.model import Card
from app.shared.models.user import User


def freeze_card(db: Session, user_id: UUID, frozen: bool) -> Card:
    account = db.query(Account).filter_by(user_id=user_id).first()
    if not account:
        raise AppError(404, "ACCOUNT_NOT_FOUND", "No existe una cuenta para este usuario")

    card = db.query(Card).filter_by(account_id=account.id).with_for_update().first()
    if card.status == "inactive" or account.status == "closed":
        raise AppError(409, "CARD_NOT_ACTIVE", "La tarjeta no puede congelarse/descongelarse en este estado")

    card.status = "frozen" if frozen else "active"
    db.commit()
    db.refresh(card)
    return card


def get_card_details(db: Session, user_id: UUID) -> dict:
    account = db.query(Account).filter_by(user_id=user_id).first()
    if not account:
        raise AppError(404, "ACCOUNT_NOT_FOUND", "No existe una cuenta para este usuario")

    card = db.query(Card).filter_by(account_id=account.id).first()
    if card.status == "inactive":
        raise AppError(409, "CARD_INACTIVE", "La tarjeta todavía no fue activada")

    user = db.query(User).filter_by(id=user_id).first()
    return {
        "card_number": card.card_number,
        "cardholder_name": user.name,
        "exp_month": card.exp_month,
        "exp_year": card.exp_year,
        "cvc": card.cvc,
    }
