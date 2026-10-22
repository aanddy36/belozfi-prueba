# Spec 1 — Database (schema manual + modelos ORM)

## Objetivo

Dejar la estructura completa de base de datos (las 9 tablas definidas en `specs/product/infra.md` sección 3) corrida manualmente en Postgres local y en Supabase, a partir de un único archivo SQL con el DDL. En el backend, mapear esas mismas tablas como modelos SQLAlchemy (equivalente a los `*.entity.ts` de Nest) para que los Specs 2/3 los usen vía ORM.

## Alcance

**Incluye:**
- Un archivo `backend/app/db/schema.sql` con el `CREATE TABLE` de las 9 tablas (en orden de dependencia por FK), los índices explícitos acordados, y el `INSERT` de seed del único usuario (John Doe).
- Los modelos SQLAlchemy (repartidos entre `shared/models/` y cada `modules/{módulo}/model.py`, según la estructura del Spec 0) como mapeo ORM puro de esas tablas.

**No incluye:**
- Ningún script Python que cree o modifique el esquema (`create_tables.py`/`seed.py` quedan descartados — ver "Decisiones" abajo). El DDL se corre **a mano**, por el usuario, en ambos entornos.
- Alembic/migraciones — no se usan.
- Ningún endpoint que use estas tablas (eso empieza en el Spec 2).

## Referencia

El esquema completo (campos, tipos, relaciones, decisiones de diseño de negocio) ya está documentado en `specs/product/infra.md`, sección "3. Base de datos". Esta spec traduce ese diseño a DDL ejecutable y a modelos ORM — no lo redefine.

## Decisiones de este spec

- **UUID nativo de Postgres**: todas las columnas `id` y las FKs usan el tipo `UUID` de Postgres con default `gen_random_uuid()`. Esta función es nativa desde PostgreSQL 13 (no requiere habilitar la extensión `pgcrypto` aparte) — se asume Postgres 13+ tanto en local como en Supabase.
- **`accounts.user_id` sin UNIQUE**: el diagrama de `infra.md` muestra `users ||--|| accounts` (1:1), pero se decide **no** forzar esa unicidad a nivel de constraint. Con un único usuario en todo el sistema (John Doe), el conflicto nunca se da en la práctica; se prioriza mantenerlo simple. `cards.account_id` sí mantiene su `UNIQUE` (ya estaba así en `infra.md`).
- **Índices explícitos** en la columna `account_id` de `purchases`, `payments`, `ledger_entries` y `collateral_deposits` — pensando en las queries de los Specs 2/3 (listar movimientos, reparto FIFO de pagos, etc.), más allá del índice automático que Postgres ya crea sobre la PK.
- **`CHECK` constraints** sobre las columnas de estado/enum (`status`, `installment_plan`) para que la DB rechace valores fuera de lo definido en `infra.md`, sin agregar tablas de catálogo.
- **Sin script de reset**: si hace falta recrear el esquema durante el desarrollo de los Specs 2/3, se hace a mano (`DROP TABLE`/pgAdmin) — no se construye una herramienta para esto.
- **Seed vía SQL, no vía Python**: el único usuario del sistema se inserta con un `INSERT ... ON CONFLICT (email) DO NOTHING` dentro del mismo `schema.sql`, no con un script `seed.py`.
- **Timestamps como `TIMESTAMPTZ`**: todas las columnas de fecha/hora (`created_at`, `updated_at`, `requested_at`, `confirmed_at`, `authorized_at`, `applied_at`, `mora_started_at`, `collateral_applied_at`, `last_accrued_at`, `activated_at`) usan `TIMESTAMPTZ`, no `TIMESTAMP`. Postgres las guarda normalizadas en UTC sin importar la zona horaria del servidor que inserta — evita discrepancias entre el Postgres local y Supabase al comparar fechas contra "hoy" (`payment_due_date`, mora, etc.).

## Tablas a crear (ver `infra.md` sección 3 para el detalle de negocio de cada campo) y dónde vive cada modelo ORM

| Tabla | Modelo vive en |
|---|---|
| `users` | `app/shared/models/` |
| `ledger_entries` | `app/shared/models/` |
| `idempotency_keys` | `app/shared/models/` |
| `accounts` | `app/modules/accounts/model.py` |
| `cards` (incluye `card_number`, `exp_month`, `exp_year`, `cvc`) | `app/modules/cards/model.py` |
| `collateral_deposits` | `app/modules/collateral/model.py` |
| `purchases` (incluye `merchant_name`) | `app/modules/purchases/model.py` |
| `payments` | `app/modules/payments/model.py` |
| `payment_allocations` (FK a `purchase_id`, no a `installment_id`) | `app/modules/payments/model.py` |

Todos los modelos comparten una única `Base` declarativa (`app/db/base.py`, del Spec 0). Los modelos **no** se usan para generar el esquema (no hay `Base.metadata.create_all()` en ningún lado de este spec) — existen únicamente para que los servicios de los Specs 2/3 lean/escriban estas tablas vía ORM.

## Tareas

- Escribir `backend/app/db/schema.sql`: `CREATE TABLE` de las 9 tablas en orden de dependencia, con tipos, `DEFAULT`, `CHECK` y `UNIQUE` según las decisiones de este spec; los 4 índices explícitos; el `INSERT` de seed de John Doe (`john.doe@hotmail.com`) al final.
- Definir cada modelo SQLAlchemy (solo mapeo de columnas/tipos/constraints/FKs, sin lógica de negocio) coincidiendo exactamente con `schema.sql`.
- Montos siempre como enteros (`_cents`, `BigInteger` en el modelo), nunca `float`.

## Aplicación del esquema

- **Local**: correr `backend/app/db/schema.sql` manualmente contra la DB local (pgAdmin o `psql`).
- **Supabase**: correr el mismo `schema.sql` manualmente, una sola vez, desde el SQL Editor de Supabase o conectado por `psql` a la connection string (no hay CI/CD para esto, ver `infra.md` sección 5).

## Criterios de aceptación

- [x] Correr `schema.sql` contra una DB local limpia crea las 9 tablas, todas las FKs, los `CHECK`, el `UNIQUE` de `cards.account_id` y los 4 índices explícitos, sin errores.
- [x] El `INSERT` de seed agrega a John Doe; volver a correr `schema.sql` completo no duplica el usuario (`ON CONFLICT (email) DO NOTHING`) ni falla por tablas ya existentes si se corre con `IF NOT EXISTS`.
- [x] Los tipos/constraints de cada modelo SQLAlchemy coinciden exactamente con `schema.sql` (mismos nombres de columna, mismos tipos, mismas nullability).
- [x] El mismo `schema.sql` se corrió contra Supabase y las 9 tablas + el seed existen ahí también.
- [x] Ningún modelo usa `Float` para un campo `_cents`.
