# Spec 3 — Worklog

## Estado: completo. Los 4 módulos (Collateral, Purchases, Payments, Transactions) están implementados y probados contra Postgres local, incluyendo concurrencia real.

## Hecho

### Módulo Collateral (`app/modules/collateral/`)
- `schema.py` — `CreateCollateralDepositRequest`.
- `service.py` — `create_collateral_deposit` (reusa el mínimo de $1.000 de Spec 2), `list_collateral_deposits` (corre `confirm_pending_deposits` antes de listar).
- `controller.py` / `route.py` — `POST /collateral-deposits`, `GET /collateral-deposits`.

### Módulo Purchases (`app/modules/purchases/`)
- `schema.py` — `CreatePurchaseRequest` (`installment_plan` como `Literal[1,3,6,12]`, 422 automático si no).
- `service.py` — `create_purchase`: lock de cuenta, valida `active`/`active`, valida cupo, crea la compra, descuenta cupo, ledger.
- `controller.py` / `route.py` — `POST /purchases`.

### Módulo Payments (`app/modules/payments/`)
- `schema.py` — `CreatePaymentRequest`.
- `service.py` — `create_payment`: lock de cuenta, valida contra deuda total y mínimo, reparte FIFO entre `purchases` `active` (interés antes que capital dentro de cada una), crea `payment_allocations`, restaura solo la porción de capital a `available_credit_cents`, marca `paid` cuando corresponde, ledger.
- `controller.py` / `route.py` — `POST /payments`.

### Módulo Transactions (`app/modules/transactions/`, nuevo — sin `model.py` ni `schema.py`, no tiene tabla propia ni recibe body)
- `service.py` — `list_transactions`: `UNION ALL` de `purchases`+`payments` vía SQL crudo, paginado con `LIMIT`/`OFFSET`, `COUNT` separado para `total`.
- `controller.py` / `route.py` — `GET /transactions?page=&page_size=`.

### `app/main.py`
- Se agregaron los 4 `include_router` nuevos (`collateral`, `purchases`, `payments`, `transactions`), sin tocar nada de Specs 0/2.

## Probado

Contra Postgres local, con `uvicorn` real + `curl` (mismo enfoque que Spec 2, sin `httpx`):

1. Cuenta creada y confirmada (igual que Spec 2) como base para todas las pruebas.
2. `POST /collateral-deposits` < $1.000 → `400 VALIDATION_ERROR`; válido ($1.500) → `200 pending`.
3. `GET /collateral-deposits` antes de confirmar: 1 `confirmed` + 1 `pending`, orden descendente por fecha. Después de 10s: ambos `confirmed`, `GET /accounts/me` refleja el cupo acumulado ($2.500 total: $1.000 inicial + $1.500 adicional).
4. `POST /purchases` que excede cupo → `409 INSUFFICIENT_CREDIT`. `installment_plan` inválido (ej. `4`) → `422` (Pydantic `Literal`). `merchant_name` vacío → `422`. Tarjeta `frozen` → `409 CARD_NOT_ACTIVE`. Compra válida ($600, 6 cuotas) → `200`, `available_credit_cents`/`current_debt_cents`/`minimum_payment_cents` recalculados correctamente en `GET /accounts/me`.
5. `POST /payments` que excede la deuda → `409 PAYMENT_EXCEEDS_DEBT`. Menor al mínimo ($10 con deuda de $600) → `409 PAYMENT_BELOW_MINIMUM`. Pago parcial ($400) → `200`, cupo restaurado correctamente. Reenvío con misma `Idempotency-Key` + mismo body → respuesta cacheada. Pago final que salda el resto ($200) → deuda en $0, cupo totalmente restaurado.
6. **Pago repartido entre dos compras distintas** (prueba específica para el criterio de `payment_allocations`): compra A ($300, más antigua) + compra B ($400, más nueva), un solo pago de $500 → se verificó directo en la tabla `payment_allocations` que generó **2 filas** (`300` aplicado a A, `200` aplicado a B), A quedó `paid` con `pending_principal_cents = 0`, B quedó `active` con `pending_principal_cents = 20000` — confirma el orden FIFO (la más antigua se salda completa antes de tocar la siguiente).
7. `GET /transactions`: compras en negativo, pagos en positivo (`merchant_name: null` en pagos), orden descendente por fecha, `total` correcto, paginación (`page_size=1`) funcionando.
8. **Concurrencia real** (el criterio que Spec 2 había dejado pendiente): con `concurrent.futures.ThreadPoolExecutor` + `http.client`, se dispararon 2 `POST /purchases` verdaderamente en paralelo (no secuenciales) por $1.500 cada una contra un cupo disponible de $2.500 (juntas lo exceden). Resultado: exactamente una devolvió `200` y la otra `409 INSUFFICIENT_CREDIT` — el lock (`SELECT ... FOR UPDATE` vía `lock_account_by_user`) serializó correctamente las dos transacciones.

Todos los datos de prueba se borraron al terminar cada corrida — la DB local quedó solo con el seed de John Doe.

## Decisiones tomadas durante la implementación (no estaban explícitas en `design.md`)

- La confirmación lazy de depósitos (`confirm_pending_deposits`) **no** se dispara automáticamente antes de `POST /purchases` ni `POST /payments` — solo la disparan `GET /accounts/me` y `GET /collateral-deposits`, tal como está documentado. Esto se confirmó durante las pruebas: una compra intentada inmediatamente después de crear la cuenta (sin pasar antes por `GET /accounts/me`) devuelve `409 CARD_NOT_ACTIVE` aunque ya hayan pasado los 10s, porque nada "miró" el estado todavía. Es el comportamiento esperado (lazy de verdad), no un bug — se deja documentado acá porque no era obvio a primera vista.

## No aplica

No quedó ningún criterio de aceptación sin probar en este spec — a diferencia de Spec 2, acá sí había un escenario de negocio real (compras concurrentes sobre el mismo cupo) para forzar la prueba de concurrencia.
