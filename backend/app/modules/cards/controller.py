from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.responses import success_response
from app.db.session import get_db
from app.modules.cards import service as cards_service
from app.modules.cards.schema import CardDetailsResponse, FreezeCardRequest
from app.shared.utils.current_user import get_current_user


async def freeze_card(payload: FreezeCardRequest, db: Session = Depends(get_db)):
    user = get_current_user(db)
    card = cards_service.freeze_card(db, user.id, payload.frozen)
    return success_response(data={"status": card.status}, message="Card updated successfully")


async def get_card_details(db: Session = Depends(get_db)):
    user = get_current_user(db)
    details = cards_service.get_card_details(db, user.id)
    data = CardDetailsResponse(**details).model_dump()
    return success_response(data=data, message="Card details retrieved successfully")
