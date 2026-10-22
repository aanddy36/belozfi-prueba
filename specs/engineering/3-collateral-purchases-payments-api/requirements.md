# Spec 3 — Collateral, Purchases, Payments & Transactions API

## Objetivo

Implementar el resto de los módulos del Core API: **Collateral**, **Purchases**, **Payments** y **Transactions** — la parte del sistema donde se concentra el riesgo real (concurrencia, consistencia, montos).

## Alcance

**Incluye:** los endpoints de estos 4 módulos, reusando la infraestructura transversal del Spec 2 (idempotencia, lock de fila, ledger).

**No incluye:** nada de frontend (Specs 4-7).

## Referencia

Los endpoints ya están completamente especificados en `specs/product/infra.md`, sección "2.1", módulos **Collateral**, **Purchases**, **Payments**, **Transactions**. Esta spec es la implementación de esos endpoints.

## Endpoints — Módulo Collateral

- `POST /collateral-deposits` — mismo flujo que el depósito inicial (mínimo $1.000, `pending` → confirmación lazy a los 10s), pero sobre una cuenta ya existente.
- `GET /collateral-deposits` — lista completa, corriendo la misma confirmación lazy antes de responder.

## Endpoints — Módulo Purchases

- `POST /purchases` — body: `merchant_name`, `amount_cents`, `installment_plan` (1/3/6/12). Dentro de una transacción: lock de la cuenta, valida `status` activo y `amount_cents <= available_credit_cents`, crea la compra (`monthly_rate` = 0 si plan=1, 0.02 si 3/6/12), descuenta cupo, escribe en el ledger.

## Endpoints — Módulo Payments

- `POST /payments` — body: `amount_cents`. Valida `amount_cents <= current_debt_cents` y `amount_cents >= min(2500, current_debt_cents)`. Dentro de una transacción: lock de la cuenta, reparte el pago entre `purchases` con saldo pendiente (más antigua primero, FIFO por `authorized_at`), crea filas en `payment_allocations`, restaura cupo, escribe en el ledger.

## Endpoints — Módulo Transactions

- `GET /transactions?page=&page_size=` — `UNION` de `purchases` y `payments` de la cuenta, ordenado por fecha descendente, paginado. Montos negativos para compras, positivos para pagos.

## Criterios de aceptación

- [ ] Una compra que excede `available_credit_cents` devuelve `409`, no se crea.
- [ ] Dos compras simultáneas sobre el mismo cupo justo al límite: una se autoriza, la otra se rechaza por cupo insuficiente — nunca ambas pasan si juntas exceden el cupo (probarlo con requests concurrentes reales, no solo secuenciales).
- [ ] Un pago que excede la deuda total devuelve error, no se procesa.
- [ ] Un pago menor a $25 (cuando la deuda es mayor a $25) devuelve error.
- [ ] Un pago que cubre parcialmente dos compras genera 2 filas en `payment_allocations`, repartidas correctamente (más antigua primero).
- [ ] `GET /transactions` devuelve compras y pagos mezclados, ordenados por fecha, con el signo correcto en `amount_cents`.
- [ ] Reenviar `POST /purchases` o `POST /payments` con la misma `Idempotency-Key` no duplica la operación.
