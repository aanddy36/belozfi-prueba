from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    String,
    Numeric,
    DateTime,
    ForeignKey,
    CheckConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base


class Purchase(Base):
    __tablename__ = "purchases"
    __table_args__ = (
        CheckConstraint("installment_plan IN (1, 3, 6, 12)", name="ck_purchases_installment_plan"),
        CheckConstraint("status IN ('active', 'paid')", name="ck_purchases_status"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=False, index=True)
    merchant_name = Column(String, nullable=False)
    amount_cents = Column(BigInteger, nullable=False)
    installment_plan = Column(Integer, nullable=False)       # 1 | 3 | 6 | 12
    monthly_rate = Column(Numeric(5, 4), nullable=False)      # ej. 0.0200
    pending_principal_cents = Column(BigInteger, nullable=False)
    accrued_interest_cents = Column(BigInteger, nullable=False, server_default="0")
    last_accrued_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, nullable=False, server_default="'active'")
    authorized_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
