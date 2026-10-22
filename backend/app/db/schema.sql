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
