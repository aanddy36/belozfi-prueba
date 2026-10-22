# Spec 2 — Accounts & Cards API

## Objetivo

Implementar los módulos **Accounts** y **Cards** del Core API, junto con la infraestructura transversal que el resto de los módulos (Spec 3) va a reusar: idempotencia, lock de fila, y escritura en el ledger.

## Alcance

**Incluye:** los 5 endpoints de Accounts/Cards, el middleware/dependencia de idempotencia, el helper de transacción con `SELECT ... FOR UPDATE`, y el helper para insertar en `ledger_entries`.

**No incluye:** Collateral, Purchases, Payments, Transactions (Spec 3).

## Referencia

Los endpoints ya están completamente especificados en `specs/product/infra.md`, sección "2.1 Síncrono (REST API — Core API)", módulos **Accounts** y **Cards**. Esta spec es la implementación de esos endpoints, no una redefinición.

## Infraestructura transversal (construir primero, se reusa en todo el resto)

- **Idempotencia**: dependencia/middleware de FastAPI que, para requests con header `Idempotency-Key`, hace `INSERT ... ON CONFLICT (key) DO NOTHING` en `idempotency_keys` antes de ejecutar el handler, y devuelve el `response_body` guardado si la key ya existe y está `completed` (ver `infra.md`, explicación completa del flujo en `prompts.md`).
- **Helper de transacción con lock**: función que abre una transacción, hace `SELECT * FROM accounts WHERE id = :id FOR UPDATE`, y la deja disponible para el resto de la operación.
- **Helper de ledger**: función que inserta una fila en `ledger_entries` (`entry_type`, `amount_cents`, `reference_type`, `reference_id`) — se usa en cada operación que mueve plata, dentro de la misma transacción.

## Endpoints — Módulo Accounts

- `GET /accounts/me` — confirma depósitos pendientes (lazy, 10s), calcula `payment_due_date`/`statement_date`/`minimum_payment_cents`/`current_debt_cents`, resuelve `display_status` con prioridad `Cancelled > Pending > Frozen > Overdue > Active`. `404` si no existe cuenta.
- `POST /accounts` — crea `account` + `card` + `collateral_deposit` iniciales. Valida mínimo $1.000. Requiere `Idempotency-Key`.
- `POST /accounts/close` — valida `current_debt_cents == 0`, libera garantía, cierra la cuenta. Requiere `Idempotency-Key`.

## Endpoints — Módulo Cards

- `PATCH /cards/freeze` — toggle `active`/`frozen`. Válido solo si la tarjeta no está `inactive` ni la cuenta `closed`.
- `GET /cards/me/details` — devuelve `card_number`, `cardholder_name`, `exp_month`, `exp_year`, `cvc` (generados al crear la tarjeta).

## Criterios de aceptación

- [ ] Crear una cuenta con depósito < $1.000 devuelve error de validación.
- [ ] Reenviar `POST /accounts` con la misma `Idempotency-Key` no crea una segunda cuenta.
- [ ] `GET /accounts/me` antes de los 10s muestra `status: pending_collateral`; después de los 10s (con solo volver a pedir el endpoint) muestra `status: active` y el cupo actualizado.
- [ ] `payment_due_date`/`statement_date` siguen la fórmula de `infra.md` (próximo día 10 ≥ hoy; salto conjunto solo al excederse).
- [ ] `POST /accounts/close` con deuda pendiente devuelve `409`, no cierra la cuenta.
- [ ] `PATCH /cards/freeze` sobre una tarjeta `inactive` devuelve `409`.
- [ ] Dos requests simultáneas que tocan la misma cuenta (ej. dos llamadas a algo que la bloquea) se serializan correctamente por el lock, sin resultados inconsistentes.
