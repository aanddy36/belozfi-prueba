from sqlalchemy import Column, String, DateTime, CheckConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from app.db.base import Base


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    __table_args__ = (
        CheckConstraint("status IN ('processing', 'completed')", name="ck_idempotency_keys_status"),
    )

    key = Column(String, primary_key=True)  # viene del header del cliente, no se genera acá
    endpoint = Column(String, nullable=False)
    request_hash = Column(String, nullable=False)
    response_body = Column(JSONB, nullable=True)
    status = Column(String, nullable=False, server_default="'processing'")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
