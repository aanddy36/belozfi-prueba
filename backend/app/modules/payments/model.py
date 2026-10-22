from sqlalchemy import Column, BigInteger, DateTime, ForeignKey, func, text
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base


class Payment(Base):
    __tablename__ = "payments"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=False, index=True)
    amount_cents = Column(BigInteger, nullable=False)
    applied_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class PaymentAllocation(Base):
    __tablename__ = "payment_allocations"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    payment_id = Column(UUID(as_uuid=True), ForeignKey("payments.id"), nullable=False)
    purchase_id = Column(UUID(as_uuid=True), ForeignKey("purchases.id"), nullable=False)
    amount_cents = Column(BigInteger, nullable=False)
