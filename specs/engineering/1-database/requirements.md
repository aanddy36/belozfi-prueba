# Spec 1 — Database (schema + seed)

## Objetivo

Crear el esquema completo de base de datos (las 9 tablas definidas en `specs/product/infra.md` sección 3) mediante un script manual (sin migraciones), y poblar el único usuario del sistema.

## Alcance

**Incluye:** modelos SQLAlchemy (repartidos entre `shared/models/` y cada `modules/{módulo}/model.py`, según la estructura del Spec 0), script de creación de tablas, script de seed.

**No incluye:** ningún endpoint que use estas tablas (eso empieza en el Spec 2). Alembic/migraciones — se decidió no usarlas; el esquema se crea y se recrea a mano cuando haga falta.

## Referencia

El esquema completo (campos, tipos, relaciones, decisiones de diseño) ya está documentado en `specs/product/infra.md`, sección "3. Base de datos". Esta spec es la implementación de ese diseño, no una redefinición.

## Tablas a crear (ver `infra.md` sección 3 para el detalle de columnas) y dónde vive cada modelo

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

Todos los modelos comparten una única `Base` declarativa (`app/db/base.py`), para que `Base.metadata.create_all()` los vea a todos.

## Tareas

- Crear `app/db/base.py` con `Base = declarative_base()`.
- Definir cada modelo SQLAlchemy (solo mapeo de columnas/tipos/constraints/FKs según `infra.md`, sin lógica).
- Montos siempre como enteros (`_cents`), nunca `float`.
- Script `backend/scripts/create_tables.py`: importa todos los modelos (para que se registren en `Base.metadata`) y corre `Base.metadata.create_all(bind=engine)`. Se corre manualmente, no está automatizado en ningún pipeline.
- Script `backend/scripts/seed.py`: crea el único `user` — **John Doe**, `john.doe@hotmail.com`. Idempotente (no duplica si ya existe). No crea `account` (eso ocurre cuando el usuario hace "Create card" desde el frontend).

## Aplicación del esquema

- **Local**: `python scripts/create_tables.py` contra `DATABASE_URL` apuntando a Postgres local, luego `python scripts/seed.py`.
- **Supabase**: los mismos 2 scripts, corridos **una sola vez** manualmente desde la máquina local apuntando a la connection string de Supabase (no hay CI/CD para esto, ver `infra.md` sección 5).

## Criterios de aceptación

- [ ] `python scripts/create_tables.py` crea las 9 tablas correctamente en una DB local limpia.
- [ ] Las FKs y constraints únicas coinciden exactamente con lo definido en `infra.md`.
- [ ] Correr `create_tables.py` dos veces no falla ni duplica nada (usa `checkfirst=True`, comportamiento por defecto de `create_all`).
- [ ] `seed.py` inserta a John Doe sin errores, y correrlo dos veces no lo duplica.
- [ ] Los mismos 2 scripts se corrieron contra Supabase y las tablas + el seed existen ahí también.
