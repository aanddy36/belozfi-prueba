from fastapi import Depends, Query
from sqlalchemy.orm import Session

from app.core.responses import success_response
from app.db.session import get_db
from app.modules.transactions import service as transactions_service
from app.shared.utils.current_user import get_current_user


async def list_transactions(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    user = get_current_user(db)
    result = transactions_service.list_transactions(db, user.id, page, page_size)
    return success_response(data=result, message="Transactions retrieved successfully")
