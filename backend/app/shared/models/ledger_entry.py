from sqlalchemy import Column, BigInteger, String, DateTime, ForeignKey, func, text
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=False, index=True)
    entry_type = Column(String, nullable=False)       # collateral_deposit | purchase | payment | ...
    amount_cents = Column(BigInteger, nullable=False)  # con signo
    reference_type = Column(String, nullable=False)
    reference_id = Column(UUID(as_uuid=True), nullable=False)  # polimórfico, no es FK real
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
