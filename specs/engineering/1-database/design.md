# Spec 1 — Design

Dos entregables independientes: el DDL (`backend/app/db/schema.sql`, se corre a mano) y los modelos SQLAlchemy (`app/shared/models/`, `app/modules/{módulo}/model.py`, se usan recién en los Specs 2/3). No hay ningún punto de conexión entre ambos en este spec — el código no ejecuta el SQL, y el SQL no sabe que existe el código.

## `backend/app/db/schema.sql`

Un solo archivo, corrido en orden (respeta las FKs), con `IF NOT EXISTS` para que sea seguro re-ejecutarlo. Se corre tal cual, una vez en local y una vez en Supabase.

```sql
-- Spec 1 — Database schema (Acme Credit)
-- Requiere PostgreSQL 13+ (gen_random_uuid() es nativo desde esa versión, no requiere extensiones).
-- Correr este archivo completo, una sola vez, contra Postgres local y contra Supabase.

-- ============================================================
-- 1. users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email      TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. accounts
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES users(id),
    status                  TEXT NOT NULL DEFAULT 'pending_collateral'
        CONSTRAINT ck_accounts_status
        CHECK (status IN ('pending_collateral', 'active', 'frozen', 'mora', 'closed')),
    credit_limit_cents      BIGINT NOT NULL DEFAULT 0,
    available_credit_cents  BIGINT NOT NULL DEFAULT 0,
    collateral_cents        BIGINT NOT NULL DEFAULT 0,
    mora_started_at         TIMESTAMPTZ,
    collateral_applied_at   TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- user_id sin UNIQUE a propósito (ver requirements.md, "Decisiones de este spec").

-- ============================================================
-- 3. cards
-- ============================================================
CREATE TABLE IF NOT EXISTS cards (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id   UUID NOT NULL UNIQUE REFERENCES accounts(id),
    status       TEXT NOT NULL DEFAULT 'inactive'
        CONSTRAINT ck_cards_status
        CHECK (status IN ('inactive', 'active', 'frozen')),
    activated_at TIMESTAMPTZ,
    card_number  TEXT NOT NULL,
    exp_month    INTEGER NOT NULL,
    exp_year     INTEGER NOT NULL,
    cvc          TEXT NOT NULL
);

-- ============================================================
-- 4. collateral_deposits
-- ============================================================
CREATE TABLE IF NOT EXISTS collateral_deposits (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id    UUID NOT NULL REFERENCES accounts(id),
    amount_cents  BIGINT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending'
        CONSTRAINT ck_collateral_deposits_status
        CHECK (status IN ('pending', 'confirmed')),
    requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at  TIMESTAMPTZ
);

-- ============================================================
-- 5. purchases
-- ============================================================
CREATE TABLE IF NOT EXISTS purchases (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id               UUID NOT NULL REFERENCES accounts(id),
    merchant_name            TEXT NOT NULL,
    amount_cents             BIGINT NOT NULL,
    installment_plan         INTEGER NOT NULL
        CONSTRAINT ck_purchases_installment_plan
        CHECK (installment_plan IN (1, 3, 6, 12)),
    monthly_rate             NUMERIC(5, 4) NOT NULL,
    pending_principal_cents  BIGINT NOT NULL,
    accrued_interest_cents   BIGINT NOT NULL DEFAULT 0,
    last_accrued_at          TIMESTAMPTZ,
    status                   TEXT NOT NULL DEFAULT 'active'
        CONSTRAINT ck_purchases_status
        CHECK (status IN ('active', 'paid')),
    authorized_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 6. payments
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id   UUID NOT NULL REFERENCES accounts(id),
    amount_cents BIGINT NOT NULL,
    applied_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 7. payment_allocations
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_allocations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id   UUID NOT NULL REFERENCES payments(id),
    purchase_id  UUID NOT NULL REFERENCES purchases(id),
    amount_cents BIGINT NOT NULL
);

-- ============================================================
-- 8. ledger_entries
-- ============================================================
CREATE TABLE IF NOT EXISTS ledger_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID NOT NULL REFERENCES accounts(id),
    entry_type      TEXT NOT NULL,
    amount_cents    BIGINT NOT NULL,       -- con signo: + entra, - sale
    reference_type  TEXT NOT NULL,
    reference_id    UUID NOT NULL,         -- polimórfico (purchase/payment/collateral_deposit): no es FK real
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 9. idempotency_keys
-- ============================================================
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key            TEXT PRIMARY KEY,       -- provisto por el cliente (header Idempotency-Key), no se genera acá
    endpoint       TEXT NOT NULL,
    request_hash   TEXT NOT NULL,
    response_body  JSONB,
    status         TEXT NOT NULL DEFAULT 'processing'
        CONSTRAINT ck_idempotency_keys_status
        CHECK (status IN ('processing', 'completed')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Índices explícitos (además de los automáticos de PK/UNIQUE)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_purchases_account_id          ON purchases(account_id);
CREATE INDEX IF NOT EXISTS idx_payments_account_id            ON payments(account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_id      ON ledger_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_collateral_deposits_account_id ON collateral_deposits(account_id);

-- ============================================================
-- Seed: único usuario del sistema
-- ============================================================
INSERT INTO users (email, name)
VALUES ('john.doe@hotmail.com', 'John Doe')
ON CONFLICT (email) DO NOTHING;
```

### Cómo correrlo

- **Local**: abrir `schema.sql` en pgAdmin (Query Tool) contra la DB local y ejecutar todo el archivo.
- **Supabase**: pegar el mismo contenido en el SQL Editor del proyecto (o conectar por `psql` a la connection string del Session pooler, ver `infra.md` sección 5) y ejecutar.
- Verificación rápida en cualquiera de los dos: `SELECT * FROM users;` debe devolver a John Doe.

## Modelos SQLAlchemy (mapeo ORM — no generan el esquema)

Todos usan la `Base` de `app/db/base.py` (Spec 0). Columnas `id`/FK como `UUID(as_uuid=True)` (import `sqlalchemy.dialects.postgresql.UUID`). Los `server_default` reflejan los `DEFAULT`/`CHECK` ya creados por `schema.sql` — existen para que el ORM sepa qué esperar, no para crear nada.

Nota de sintaxis: cuando `server_default` es un valor de texto (ej. `'active'`), hay que pasar las comillas simples dentro del string de Python (`server_default="'active'"`), porque SQLAlchemy inserta ese valor tal cual en el DDL — sin comillas propias generaría SQL inválido. Los valores numéricos (`"0"`) no las necesitan.

### `app/shared/models/` (3 archivos: `user.py`, `ledger_entry.py`, `idempotency_key.py`)

```python
# user.py
from sqlalchemy import Column, String, DateTime, func, text
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
```

```python
# ledger_entry.py
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
```

```python
# idempotency_key.py
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
```

### `app/modules/accounts/model.py`

```python
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
```

### `app/modules/cards/model.py`

```python
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
```

### `app/modules/collateral/model.py`

```python
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
```

### `app/modules/purchases/model.py`

```python
from sqlalchemy import Column, Integer, BigInteger, String, Numeric, DateTime, ForeignKey, CheckConstraint, func, text
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
```

### `app/modules/payments/model.py` (2 clases: `Payment` y `PaymentAllocation`)

```python
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
```

## Nota para los Specs 2/3

Como los `id` se generan en el servidor (`gen_random_uuid()`, no en Python), un objeto recién creado con el ORM no tiene `id` hasta que se haga `db.flush()` (o `commit()`). Si un servicio necesita el `id` de una fila recién insertada antes de seguir operando dentro de la misma transacción (ej. crear `account` y, con su `id`, crear `card` en el mismo `POST /accounts`), hay que llamar `db.flush()` explícitamente entre ambos inserts.
