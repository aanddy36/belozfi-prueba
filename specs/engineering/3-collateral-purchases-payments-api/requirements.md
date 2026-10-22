# Spec 3 — Collateral, Purchases, Payments & Transactions API

## Objetivo

Implementar el resto de los módulos del Core API: **Collateral**, **Purchases**, **Payments** y **Transactions** — la parte del sistema donde se concentra el riesgo real (concurrencia, consistencia, montos).

## Alcance

**Incluye:** los endpoints de estos 4 módulos, reusando la infraestructura transversal del Spec 2 (idempotencia, lock de fila, ledger).

**No incluye:** nada de frontend (Specs 4-7).

## Referencia

Los endpoints ya están completamente especificados en `specs/product/infra.md`, sección "2.1", módulos **Collateral**, **Purchases**, **Payments**, **Transactions**. Esta spec es la implementación de esos endpoints.

## Convenciones reusadas de Spec 2 (sin redefinir)

Mismo envelope de respuesta (`success_response` / `AppError` / los 4 exception handlers), misma idempotencia (con el fix de staleness), mismo `lock_account_by_user`, mismo `record_ledger_entry`, mismo `confirm_pending_deposits`, mismo `get_current_user` sin auth.

**Regla de clasificación de errores de negocio** (para mantener consistencia con Spec 2): `400 VALIDATION_ERROR` cuando el valor viola un umbral fijo e independiente del estado de la cuenta (ej. "mínimo $1.000"); `409` con un código específico cuando el valor es válido en sí mismo pero choca con el estado financiero *actual* de la cuenta (cupo disponible, deuda total).

**Catálogo de códigos de error nuevos de este spec:** `ACCOUNT_CLOSED` (409 — depósito de garantía sobre cuenta cerrada), `INSUFFICIENT_CREDIT` (409 — compra excede `available_credit_cents`), `PAYMENT_EXCEEDS_DEBT` (409 — pago excede `current_debt_cents`), `PAYMENT_BELOW_MINIMUM` (409 — pago menor al mínimo). Reusados de Spec 2: `ACCOUNT_NOT_FOUND`, `CARD_NOT_ACTIVE` (compra sobre cuenta/tarjeta no activa), `VALIDATION_ERROR`, `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_CONFLICT`.

## Endpoints — Módulo Collateral

- `POST /collateral-deposits` — mismo flujo que el depósito inicial (mínimo $1.000 → `400 VALIDATION_ERROR`, `pending` → confirmación lazy a los 10s), pero sobre una cuenta ya existente. `404 ACCOUNT_NOT_FOUND` si no hay cuenta; `409 ACCOUNT_CLOSED` si la cuenta ya está cerrada. Requiere `Idempotency-Key`.
- `GET /collateral-deposits` — lista completa (sin paginar, son pocos registros por cuenta), corriendo la misma confirmación lazy antes de responder. `404 ACCOUNT_NOT_FOUND` si no hay cuenta.

## Endpoints — Módulo Purchases

- `POST /purchases` — body: `merchant_name` (no vacío), `amount_cents` (> 0), `installment_plan` (literal `1`/`3`/`6`/`12`, cualquier otro valor da `422` de Pydantic). Dentro de una transacción: lock de la cuenta, valida `accounts.status == active AND cards.status == active` (`409 CARD_NOT_ACTIVE` si no) y `amount_cents <= available_credit_cents` (`409 INSUFFICIENT_CREDIT` si no), crea la compra (`monthly_rate` = 0 si plan=1, 0.02 si 3/6/12; `pending_principal_cents = amount_cents`; `accrued_interest_cents = 0`, nunca se acumula interés real en este MVP — ver `infra.md` sección 4), descuenta cupo, escribe en el ledger. Requiere `Idempotency-Key`.

## Endpoints — Módulo Payments

- `POST /payments` — body: `amount_cents` (> 0). Valida `amount_cents <= current_debt_cents` (`409 PAYMENT_EXCEEDS_DEBT` si no) y `amount_cents >= min(2500, current_debt_cents)` (`409 PAYMENT_BELOW_MINIMUM` si no). Dentro de una transacción: lock de la cuenta, reparte el pago entre `purchases` `active` (más antigua primero, FIFO por `authorized_at`; dentro de cada compra, interés acumulado antes que capital — en la práctica siempre 0, ver `infra.md` sección 4), crea una fila en `payment_allocations` por cada compra tocada, restaura a `available_credit_cents` solo la porción de **capital** pagada (no la de interés), marca `purchases.status = paid` cuando su saldo llega a 0, escribe en el ledger. Requiere `Idempotency-Key`.

## Endpoints — Módulo Transactions

- `GET /transactions?page=1&page_size=20` — `UNION ALL` de `purchases` y `payments` de la cuenta, ordenado por fecha descendente, paginado (`page_size` default 20, la Home lo llama con `page_size=6`). Montos negativos para compras, positivos para pagos; `merchant_name` es `null` en los ítems de tipo `payment`. `404 ACCOUNT_NOT_FOUND` si no hay cuenta.

## Criterios de aceptación

- [x] Una compra que excede `available_credit_cents` devuelve `409`, no se crea.
- [x] Dos compras simultáneas sobre el mismo cupo justo al límite: una se autoriza, la otra se rechaza por cupo insuficiente — nunca ambas pasan si juntas exceden el cupo (probado con requests concurrentes reales vía threads, no solo secuenciales).
- [x] Un pago que excede la deuda total devuelve error, no se procesa.
- [x] Un pago menor a $25 (cuando la deuda es mayor a $25) devuelve error.
- [x] Un pago que cubre parcialmente dos compras genera 2 filas en `payment_allocations`, repartidas correctamente (más antigua primero).
- [x] `GET /transactions` devuelve compras y pagos mezclados, ordenados por fecha, con el signo correcto en `amount_cents`.
- [x] Reenviar `POST /purchases` o `POST /payments` con la misma `Idempotency-Key` no duplica la operación.
