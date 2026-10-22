from sqlalchemy import Column, BigInteger, String, DateTime, ForeignKey, CheckConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base


class CollateralDeposit(Base):
    __tablename__ = "collateral_deposits"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'confirmed')", name="ck_collateral_deposits_status"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=False, index=True)
    amount_cents = Column(BigInteger, nullable=False)
    status = Column(String, nullable=False, server_default="'pending'")
    requested_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
