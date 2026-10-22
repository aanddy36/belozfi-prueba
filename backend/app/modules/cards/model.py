from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, CheckConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base


class Card(Base):
    __tablename__ = "cards"
    __table_args__ = (
        CheckConstraint("status IN ('inactive', 'active', 'frozen')", name="ck_cards_status"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=False, unique=True)
    status = Column(String, nullable=False, server_default="'inactive'")
    activated_at = Column(DateTime(timezone=True), nullable=True)
    card_number = Column(String, nullable=False)
    exp_month = Column(Integer, nullable=False)
    exp_year = Column(Integer, nullable=False)
    cvc = Column(String, nullable=False)
