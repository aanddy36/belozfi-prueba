# Spec 1 — Worklog

## Estado: completo. Esquema corrido en local y Supabase, modelos SQLAlchemy creados y verificados.

## Hecho

### `backend/app/db/schema.sql`
- DDL de las 9 tablas (`users`, `accounts`, `cards`, `collateral_deposits`, `purchases`, `payments`, `payment_allocations`, `ledger_entries`, `idempotency_keys`), en orden de dependencia por FK, con `CREATE TABLE IF NOT EXISTS`.
- `CHECK` constraints nombrados para los 5 campos de enum (`ck_accounts_status`, `ck_cards_status`, `ck_collateral_deposits_status`, `ck_purchases_installment_plan`, `ck_purchases_status`, `ck_idempotency_keys_status`).
- `UNIQUE` en `cards.account_id`; `accounts.user_id` sin `UNIQUE` a propósito (ver `requirements.md`).
- 4 índices explícitos en `account_id` (`purchases`, `payments`, `ledger_entries`, `collateral_deposits`).
- Seed del único usuario (John Doe) vía `INSERT ... ON CONFLICT (email) DO NOTHING`.
- **Corrido manualmente por el usuario** (no por este agente) contra Postgres local y contra Supabase, según lo acordado en `requirements.md` ("Decisiones de este spec").

### Modelos SQLAlchemy (mapeo ORM, sin generar esquema)
- `app/shared/models/user.py`, `ledger_entry.py`, `idempotency_key.py`.
- `app/modules/{accounts,cards,collateral,purchases,payments}/model.py` (5 archivos; `payments/model.py` contiene 2 clases: `Payment` y `PaymentAllocation`).
- `__init__.py` agregado en `app/modules/` y en cada subcarpeta de módulo nueva (`accounts/`, `cards/`, `collateral/`, `purchases/`, `payments/`), siguiendo la convención de `shared/models/` y `shared/utils/` del Spec 0.
- Todas las columnas `id`/FK como `UUID(as_uuid=True)` con `server_default=text("gen_random_uuid()")` — ningún `id` se genera en Python.
- `CheckConstraint` en `__table_args__` espejando exactamente los `CHECK` de `schema.sql` (mismo nombre de constraint).

## Probado

- Import de los 8 módulos de modelos (`python -c "from app.shared.models... ; from app.modules...model import ..."`) sin errores.
- `User.metadata.tables.keys()` devuelve las 9 tablas esperadas — confirma que todos los modelos están registrados sobre la misma `Base` compartida (`app/db/base.py`).
- La ejecución de `schema.sql` contra Postgres local y contra Supabase quedó a cargo del usuario (confirmado por él, no verificado por este agente contra las DBs reales).

## Desvíos respecto al `design.md` original

- **Ubicación de `schema.sql`**: se pidió explícitamente en `app/db/schema.sql` en vez de `backend/sql/schema.sql` como decía la primera versión de `design.md` — mismo contenido, solo cambia la carpeta. `requirements.md` y `design.md` ya se actualizaron para reflejar la ruta final.

## Cierre

Spec 1 terminado. Los 5 criterios de aceptación de `requirements.md` quedan cumplidos:

- [x] `schema.sql` corrido contra una DB local limpia: 9 tablas, FKs, `CHECK`, `UNIQUE` de `cards.account_id` y los 4 índices explícitos, sin errores (confirmado por el usuario).
- [x] Seed de John Doe insertado; `ON CONFLICT (email) DO NOTHING` + `CREATE TABLE IF NOT EXISTS` hacen que re-correr el archivo completo no falle ni duplique nada.
- [x] Los 8 modelos SQLAlchemy coinciden exactamente con `schema.sql` (columnas, tipos, `CHECK`, `UNIQUE`, nullability) — verificado por inspección directa contra el archivo al escribirlos.
- [x] Mismo `schema.sql` corrido contra Supabase, con el mismo resultado (confirmado por el usuario).
- [x] Ningún modelo usa `Float` en un campo `_cents` — todos son `BigInteger`.

No queda nada pendiente de este spec. Sigue el Spec 2 (Accounts & Cards API).
