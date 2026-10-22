# Spec 2 — Accounts & Cards API

## Objetivo

Implementar los módulos **Accounts** y **Cards** del Core API, junto con la infraestructura transversal que el resto de los módulos (Spec 3) va a reusar: estandarización de respuesta/errores, idempotencia, lock de fila, y escritura en el ledger.

## Alcance

**Incluye:** los 5 endpoints de Accounts/Cards; el helper de respuesta estándar y los exception handlers de error; el middleware/dependencia de idempotencia; el helper de transacción con `SELECT ... FOR UPDATE`; el helper para insertar en `ledger_entries`; el helper de confirmación lazy de depósitos de garantía (compartido con Spec 3).

**No incluye:** Collateral, Purchases, Payments, Transactions (Spec 3) — aunque el helper de confirmación lazy y el de idempotencia se construyen acá porque `GET /accounts/me` ya los necesita, y quedan listos para que Spec 3 los reuse tal cual.

## Referencia

Los endpoints ya están completamente especificados en `specs/product/infra.md`, sección "2.1 Síncrono (REST API — Core API)", módulos **Accounts** y **Cards**. Esta spec es la implementación de esos endpoints, no una redefinición.

## Infraestructura transversal (construir primero, se reusa en todo el resto)

### Estandarización de respuesta y errores

Toda respuesta de la API sigue uno de estos dos formatos, nunca un híbrido:

- **Éxito**: `{ "statusCode": 200, "message": "...", "data": {...} }` — `data` puede ser `null` si la operación no devuelve nada relevante (ej. una acción de solo side-effect), pero la key siempre está presente. Se arma con un helper `success_response(data=None, message="OK", status_code=200)`.
- **Error**: `{ "statusCode": 404, "message": "...", "error": { "code": "ACCOUNT_NOT_FOUND", "details"?: [...] } }` — acá la key es `error`, no `data`. `details` solo aparece en errores de validación (lista de campo + motivo).

4 exception handlers globales, registrados en `app/main.py`, cubren **todo** lo que puede fallar en un request:

| Excepción | `statusCode` | `error.code` |
|---|---|---|
| `AppError` (clase propia, la usan los `service.py`) | el que indique la excepción | el que indique la excepción |
| `RequestValidationError` (body no cumple el schema Pydantic) | 422 | `VALIDATION_ERROR` (con `details` por campo) |
| `HTTPException` (nativo de FastAPI/Starlette, por si algo la lanza directo) | el que traiga la excepción | `HTTP_ERROR` |
| `Exception` (catch-all, no debería pasar) | 500 | `INTERNAL_SERVER_ERROR` (sin exponer detalles internos) |

Catálogo de códigos de error que usa este spec: `VALIDATION_ERROR` (400 — regla de negocio, ej. depósito < $1.000; o 422 — schema inválido), `ACCOUNT_NOT_FOUND` (404), `ACCOUNT_ALREADY_EXISTS` (409 — ya existe cuenta para el usuario), `OUTSTANDING_BALANCE` (409 — cierre con deuda pendiente), `CARD_NOT_ACTIVE` (409 — freeze sobre tarjeta `inactive` o cuenta `closed`), `CARD_INACTIVE` (409 — `GET /cards/me/details` antes de la activación), `IDEMPOTENCY_KEY_REQUIRED` (400 — falta el header en un endpoint que lo exige), `IDEMPOTENCY_KEY_CONFLICT` (409 — misma key con body distinto).

### Idempotencia

Dependencia de FastAPI para requests con header `Idempotency-Key` (obligatorio en `POST /accounts` y `POST /accounts/close`; no aplica a `PATCH /cards/freeze`, que ya es idempotente por naturaleza):

1. Falta el header → `400 IDEMPOTENCY_KEY_REQUIRED`.
2. Se calcula `request_hash` (hash del body crudo). Se intenta `INSERT` en `idempotency_keys` con `status = 'processing'`.
3. Si el `INSERT` tuvo éxito (key nueva) → se ejecuta el handler. Si termina bien, se actualiza la fila a `status = 'completed'` con el `response_body`. Si falla (se lanza un `AppError`), se borra la fila para que la key quede libre para un reintento real.
4. Si la key ya existía:
   - `status = 'completed'` y mismo `request_hash` → se devuelve el `response_body` cacheado tal cual (mismo `200`).
   - `status = 'completed'` y `request_hash` distinto → `409 IDEMPOTENCY_KEY_CONFLICT`.
   - `status = 'processing'` y lleva menos de 30s así → `409 IDEMPOTENCY_KEY_CONFLICT` (reintento concurrente genuino).
   - `status = 'processing'` y lleva más de 30s así → se trata como abandonada (ej. un intento anterior que falló la validación de Pydantic antes de llegar al `try/except` del controller) y se permite un reintento limpio.

### Helper de transacción con lock

Función que abre una transacción, hace `SELECT * FROM accounts WHERE id = :id FOR UPDATE`, y la deja disponible para el resto de la operación. Lanza `AppError(404, "ACCOUNT_NOT_FOUND")` si no existe.

### Helper de ledger

Función que inserta una fila en `ledger_entries` (`entry_type`, `amount_cents`, `reference_type`, `reference_id`) — se usa en cada operación que mueve plata, dentro de la misma transacción.

### Helper de confirmación lazy de depósitos de garantía (compartido con Spec 3)

Función que, para la cuenta dada, confirma todo `collateral_deposit` en `pending` con `requested_at` de más de 10 segundos: lo marca `confirmed`, suma el monto a `accounts.collateral_cents`/`credit_limit_cents`/`available_credit_cents`, postea al ledger, y — solo en la primera confirmación de la cuenta — activa `accounts.status = 'active'` y `cards.status = 'active'` (+ `cards.activated_at`). La usa `GET /accounts/me` en este spec; Spec 3 la reusa en el módulo Collateral.

## Endpoints — Módulo Accounts

- `GET /accounts/me` — corre la confirmación lazy primero, calcula `payment_due_date`/`statement_date`/`minimum_payment_cents`/`current_debt_cents`, resuelve `display_status` con prioridad `Cancelled > Pending > Frozen > Overdue > Active`. `404 ACCOUNT_NOT_FOUND` si no existe cuenta.
- `POST /accounts` — crea `account` + `card` + `collateral_deposit` iniciales. Valida mínimo $1.000 (`400 VALIDATION_ERROR` si no). Requiere `Idempotency-Key`.
- `POST /accounts/close` — valida `current_debt_cents == 0` (`409 OUTSTANDING_BALANCE` si no), libera garantía, cierra la cuenta. Requiere `Idempotency-Key`.

## Endpoints — Módulo Cards

- `PATCH /cards/freeze` — toggle `active`/`frozen`. `409 CARD_NOT_ACTIVE` si la tarjeta está `inactive` o la cuenta `closed`.
- `GET /cards/me/details` — devuelve `card_number`, `cardholder_name` (del `users.name`), `exp_month`, `exp_year`, `cvc`. `409 CARD_INACTIVE` si `cards.status == inactive` (el dato ya existe en la fila, pero se bloquea igual porque el negocio todavía no activó la tarjeta).

## Criterios de aceptación

- [x] Toda respuesta exitosa tiene la forma `{ statusCode, message, data }`; toda respuesta de error tiene la forma `{ statusCode, message, error }` — nunca ambas keys (`data`/`error`) juntas en la misma respuesta.
- [x] Un body inválido para el schema de Pydantic (ej. falta `deposit_amount_cents`, o viene como string) devuelve `422` con el mismo envelope de error (`VALIDATION_ERROR` + `details` por campo), no el formato default de FastAPI (`{"detail": [...]}`).
- [x] Crear una cuenta con depósito < $1.000 devuelve `400 VALIDATION_ERROR`.
- [x] Reenviar `POST /accounts` con la misma `Idempotency-Key` y el mismo body no crea una segunda cuenta, devuelve el `response_body` cacheado.
- [x] Reenviar `POST /accounts` con la misma `Idempotency-Key` pero un body distinto devuelve `409 IDEMPOTENCY_KEY_CONFLICT`.
- [x] `GET /accounts/me` antes de los 10s muestra `display_status: Pending`; después de los 10s (con solo volver a pedir el endpoint) muestra `Active` y el cupo actualizado.
- [x] `payment_due_date`/`statement_date` siguen la fórmula de `infra.md` (próximo día 10 ≥ hoy; salto conjunto solo al excederse).
- [x] `POST /accounts/close` con deuda pendiente devuelve `409 OUTSTANDING_BALANCE`, no cierra la cuenta.
- [x] `PATCH /cards/freeze` sobre una tarjeta `inactive` devuelve `409 CARD_NOT_ACTIVE`.
- [x] `GET /cards/me/details` sobre una tarjeta `inactive` devuelve `409 CARD_INACTIVE`.
- [ ] Dos requests simultáneas que tocan la misma cuenta (ej. dos llamadas a algo que la bloquea) se serializan correctamente por el lock, sin resultados inconsistentes. *(no probado en este spec — ver `worklog.md`; el lock es correcto por construcción con `SELECT ... FOR UPDATE`, pero no hay en Accounts/Cards un escenario con impacto de negocio real para forzar la carrera. Se prueba de verdad en Spec 3, donde dos compras/pagos simultáneos sí pueden pisarse el cupo.)*
