# Spec 1 — Design

Todos los modelos usan la `Base` de `app/db/base.py` (Spec 0). Tipos de columnas pensados para Postgres vía SQLAlchemy: `BigInteger` para todos los `_cents` (nunca `Float`), `String` para IDs (UUID como string) y enums de estado, `DateTime` para timestamps.

## `app/shared/models/` (3 archivos: `user.py`, `ledger_entry.py`, `idempotency_key.py`)

```python
# user.py
import uuid
from sqlalchemy import Column, String, DateTime, func
from app.db.base import Base

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

```python
# ledger_entry.py
import uuid
from sqlalchemy import Column, String, BigInteger, DateTime, ForeignKey, func
from app.db.base import Base

class LedgerEntry(Base):
    __tablename__ = "ledger_entries"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id = Column(String, ForeignKey("accounts.id"), nullable=False)
    entry_type = Column(String, nullable=False)  # collateral_deposit | purchase | payment | ...
    amount_cents = Column(BigInteger, nullable=False)  # con signo
    reference_type = Column(String, nullable=False)
    reference_id = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

```python
# idempotency_key.py
from sqlalchemy import Column, String, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from app.db.base import Base

class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    key = Column(String, primary_key=True)
    endpoint = Column(String, nullable=False)
    request_hash = Column(String, nullable=False)
    response_body = Column(JSONB, nullable=True)
    status = Column(String, nullable=False, default="processing")  # processing | completed
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

## `app/modules/accounts/model.py`

```python
import uuid
from sqlalchemy import Column, String, BigInteger, DateTime, ForeignKey, func
from app.db.base import Base

class Account(Base):
    __tablename__ = "accounts"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, unique=True)
    status = Column(String, nullable=False, default="pending_collateral")
    credit_limit_cents = Column(BigInteger, nullable=False, default=0)
    available_credit_cents = Column(BigInteger, nullable=False, default=0)
    collateral_cents = Column(BigInteger, nullable=False, default=0)
    mora_started_at = Column(DateTime(timezone=True), nullable=True)
    collateral_applied_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

## `app/modules/cards/model.py`

```python
import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, func
from app.db.base import Base

class Card(Base):
    __tablename__ = "cards"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id = Column(String, ForeignKey("accounts.id"), nullable=False, unique=True)
    status = Column(String, nullable=False, default="inactive")  # inactive | active | frozen
    activated_at = Column(DateTime(timezone=True), nullable=True)
    card_number = Column(String, nullable=False)
    exp_month = Column(Integer, nullable=False)
    exp_year = Column(Integer, nullable=False)
    cvc = Column(String, nullable=False)
```

## `app/modules/collateral/model.py`

```python
import uuid
from sqlalchemy import Column, String, BigInteger, DateTime, ForeignKey, func
from app.db.base import Base

class CollateralDeposit(Base):
    __tablename__ = "collateral_deposits"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id = Column(String, ForeignKey("accounts.id"), nullable=False)
    amount_cents = Column(BigInteger, nullable=False)
    status = Column(String, nullable=False, default="pending")  # pending | confirmed
    requested_at = Column(DateTime(timezone=True), server_default=func.now())
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
```

## `app/modules/purchases/model.py`

```python
import uuid
from sqlalchemy import Column, String, Integer, BigInteger, Numeric, DateTime, ForeignKey, func
from app.db.base import Base

class Purchase(Base):
    __tablename__ = "purchases"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id = Column(String, ForeignKey("accounts.id"), nullable=False)
    merchant_name = Column(String, nullable=False)
    amount_cents = Column(BigInteger, nullable=False)
    installment_plan = Column(Integer, nullable=False)  # 1 | 3 | 6 | 12
    monthly_rate = Column(Numeric(5, 4), nullable=False)  # ej. 0.0200
    pending_principal_cents = Column(BigInteger, nullable=False)
    accrued_interest_cents = Column(BigInteger, nullable=False, default=0)
    last_accrued_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, nullable=False, default="active")  # active | paid
    authorized_at = Column(DateTime(timezone=True), server_default=func.now())
```

## `app/modules/payments/model.py` (2 clases: `Payment` y `PaymentAllocation`)

```python
import uuid
from sqlalchemy import Column, String, BigInteger, DateTime, ForeignKey, func
from app.db.base import Base

class Payment(Base):
    __tablename__ = "payments"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id = Column(String, ForeignKey("accounts.id"), nullable=False)
    amount_cents = Column(BigInteger, nullable=False)
    applied_at = Column(DateTime(timezone=True), server_default=func.now())

class PaymentAllocation(Base):
    __tablename__ = "payment_allocations"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    payment_id = Column(String, ForeignKey("payments.id"), nullable=False)
    purchase_id = Column(String, ForeignKey("purchases.id"), nullable=False)
    amount_cents = Column(BigInteger, nullable=False)
```

## `backend/scripts/create_tables.py`

Importa todos los modelos (para que se registren en `Base.metadata`) antes de llamar a `create_all`:

```python
from app.db.base import Base
from app.db.session import engine

# el import, aunque no se use directo, registra las clases en Base.metadata
from app.shared.models.user import User
from app.shared.models.ledger_entry import LedgerEntry
from app.shared.models.idempotency_key import IdempotencyKey
from app.modules.accounts.model import Account
from app.modules.cards.model import Card
from app.modules.collateral.model import CollateralDeposit
from app.modules.purchases.model import Purchase
from app.modules.payments.model import Payment, PaymentAllocation

if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    print("Tables created.")
```

## `backend/scripts/seed.py`

```python
from app.db.session import SessionLocal
from app.shared.models.user import User

def seed():
    db = SessionLocal()
    try:
        existing = db.query(User).filter_by(email="john.doe@hotmail.com").first()
        if existing:
            print("John Doe already exists, skipping.")
            return
        user = User(email="john.doe@hotmail.com", name="John Doe")
        db.add(user)
        db.commit()
        print(f"Seeded user {user.id}")
    finally:
        db.close()

if __name__ == "__main__":
    seed()
```

## Cómo correrlo (local y Supabase)

```bash
cd backend
source venv/bin/activate
python -m scripts.create_tables   # o: PYTHONPATH=. python scripts/create_tables.py
python -m scripts.seed
```

Para Supabase: cambiar temporalmente `DATABASE_URL` en `.env` a la connection string de Supabase, correr los mismos 2 comandos, y volver a poner la de local.
