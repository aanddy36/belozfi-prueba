from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.shared.models.user import User


def get_current_user(db: Session) -> User:
    user = db.query(User).first()
    if not user:
        raise AppError(500, "INTERNAL_SERVER_ERROR", "No hay ningún usuario cargado en el sistema")
    return user
