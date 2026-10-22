from sqlalchemy import Column, String, BigInteger, DateTime, ForeignKey, CheckConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending_collateral', 'active', 'frozen', 'mora', 'closed')",
            name="ck_accounts_status",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)  # sin UNIQUE, ver requirements.md
    status = Column(String, nullable=False, server_default="'pending_collateral'")
    credit_limit_cents = Column(BigInteger, nullable=False, server_default="0")
    available_credit_cents = Column(BigInteger, nullable=False, server_default="0")
    collateral_cents = Column(BigInteger, nullable=False, server_default="0")
    mora_started_at = Column(DateTime(timezone=True), nullable=True)
    collateral_applied_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
