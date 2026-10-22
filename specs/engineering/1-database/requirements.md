# Spec 1 — Database (schema + seed)

## Objetivo

Crear el esquema completo de base de datos (las 10 tablas definidas en `specs/product/infra.md` sección 3) vía migraciones, y poblar el único usuario del sistema.

## Alcance

**Incluye:** modelos SQLAlchemy, migraciones Alembic, script de seed.

**No incluye:** ningún endpoint que use estas tablas (eso empieza en el Spec 2).

## Referencia

El esquema completo (campos, tipos, relaciones, decisiones de diseño) ya está documentado en `specs/product/infra.md`, sección "3. Base de datos". Esta spec es la implementación de ese diseño, no una redefinición.

## Tablas a crear (ver `infra.md` sección 3 para el detalle de columnas)

1. `users`
2. `accounts`
3. `cards` (incluye `card_number`, `exp_month`, `exp_year`, `cvc`)
4. `collateral_deposits`
5. `purchases` (incluye `merchant_name`)
6. `payments`
7. `payment_allocations` (FK a `purchase_id`, no a `installment_id` — `installments` no existe en este esquema)
8. `ledger_entries`
9. `idempotency_keys`

## Tareas

- Inicializar Alembic en `backend/`.
- Definir los modelos SQLAlchemy para las 9 tablas (ninguna lógica, solo el mapeo de columnas/tipos/constraints según `infra.md`).
- Generar la migración inicial que crea todas las tablas, con sus FKs, `UNIQUE` constraints (ej. `cards.account_id`, `(statements...)` — N/A ya que no hay `statements`), y el `UNIQUE` en `idempotency_keys.key`.
- Montos siempre como enteros (`_cents`), nunca `float` — tal como define `infra.md`.
- Script de seed (`scripts/seed.py` o similar): crea el único `user` — **John Doe**, `john.doe@hotmail.com`. No crea `account` todavía (la cuenta se crea recién cuando el usuario hace "Create card" desde el frontend).

## Aplicación del esquema

- **Local**: `alembic upgrade head` contra la DB local de Postgres.
- **Supabase**: `alembic upgrade head` contra la connection string de Supabase — se corre **una sola vez**, manualmente, desde la máquina local (no hay CI/CD para esto, ver `infra.md` sección 5).

## Criterios de aceptación

- [ ] `alembic upgrade head` crea las 9 tablas correctamente en una DB local limpia.
- [ ] Las FKs y constraints únicas coinciden exactamente con lo definido en `infra.md`.
- [ ] El script de seed inserta a John Doe sin errores, y correrlo dos veces no duplica el usuario (idempotente).
- [ ] El mismo `alembic upgrade head` se corrió contra Supabase y las tablas existen ahí también.
