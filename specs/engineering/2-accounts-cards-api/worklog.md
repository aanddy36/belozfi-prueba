# Spec 2 — Worklog

## Estado: completo. Los 5 endpoints de Accounts/Cards y la infraestructura transversal están implementados y probados contra Postgres local.

## Hecho

### Infraestructura transversal
- `app/core/responses.py` — `success_response(data, message, status_code)`.
- `app/core/errors.py` — clase `AppError`.
- `app/core/exception_handlers.py` — los 4 handlers (`AppError`, `RequestValidationError`, `HTTPException`, catch-all `Exception`), registrados en `app/main.py` vía `register_exception_handlers(app)`.
- `app/shared/utils/idempotency.py` — `require_idempotency_key` / `complete_idempotency_key` / `release_idempotency_key`, con el fix de staleness (ver "Desvíos" abajo).
- `app/shared/utils/locking.py` — `lock_account_by_user`.
- `app/shared/utils/ledger.py` — `record_ledger_entry`.
- `app/shared/utils/collateral_confirmation.py` — `confirm_pending_deposits` (compartido con Spec 3).
- `app/shared/utils/current_user.py` — `get_current_user` (no hay auth; trae la única fila de `users`).

### Módulo Accounts (`app/modules/accounts/`)
- `schema.py` — `CreateAccountRequest`.
- `service.py` — `create_account`, `get_account_me` (+ helpers de fecha/mínimo/display_status), `close_account`.
- `controller.py` — `get_me`, `create_account`, `close_account`.
- `route.py` — `GET /accounts/me`, `POST /accounts`, `POST /accounts/close`.

### Módulo Cards (`app/modules/cards/`)
- `schema.py` — `FreezeCardRequest`, `CardDetailsResponse`.
- `service.py` — `freeze_card`, `get_card_details`.
- `controller.py` — `freeze_card`, `get_card_details`.
- `route.py` — `PATCH /cards/freeze`, `GET /cards/me/details`.

### `app/main.py`
- Se agregaron `register_exception_handlers(app)` y los `include_router` de `accounts`/`cards`, sin tocar `/health` ni el middleware de CORS ya existentes del Spec 0.

## Probado

Contra Postgres local (`acme_app`), levantando el server real con `uvicorn` (no `TestClient`, por no tener `httpx` instalado) y pegándole con `curl`, 18 escenarios en secuencia — todos con el resultado esperado:

1. `GET /accounts/me` sin cuenta → `404 ACCOUNT_NOT_FOUND`.
2. `POST /accounts` sin `Idempotency-Key` → `400 IDEMPOTENCY_KEY_REQUIRED`.
3. `POST /accounts` con depósito < $1.000 → `400 VALIDATION_ERROR`.
4. `POST /accounts` válido → `200`, cuenta `pending_collateral`.
5. Reenvío con misma key + mismo body → misma respuesta cacheada (mismo `id`).
6. Reenvío con misma key + body distinto → `409 IDEMPOTENCY_KEY_CONFLICT`.
7. Segundo `POST /accounts` con otra key (ya existe cuenta) → `409 ACCOUNT_ALREADY_EXISTS`.
8. `GET /accounts/me` antes de los 10s → `display_status: Pending`.
9. `GET /cards/me/details` con tarjeta `inactive` → `409 CARD_INACTIVE`.
10. `PATCH /cards/freeze` con tarjeta `inactive` → `409 CARD_NOT_ACTIVE`.
11. `GET /accounts/me` después de los 10s → `display_status: Active`, cupo/garantía actualizados (`credit_limit_cents`/`available_credit_cents`/`collateral_cents` = 100000).
12. `GET /cards/me/details` ya activa → datos correctos, `cardholder_name: "John Doe"`.
13. `PATCH /cards/freeze` → `frozen`.
14. `GET /accounts/me` con tarjeta `frozen` → `display_status: Frozen`.
15. `PATCH /cards/freeze` → vuelta a `active`.
16. `POST /accounts/close` sin deuda → `200`, cuenta `closed`, garantía liberada.
17. `GET /accounts/me` ya cerrada → `display_status: Cancelled`.
18. Body inválido (falta `deposit_amount_cents`) → `422 VALIDATION_ERROR` con `error.details` por campo (no el formato default de FastAPI).

También se verificaron las fórmulas de fecha en vivo: con el sistema en 2026-10-22, `payment_due_date` resolvió a `2026-11-10` y `statement_date` a `2026-10-20` — coincide con la fórmula de `infra.md`.

Todos los datos de prueba (cuenta, tarjeta, depósito, ledger, idempotency keys de prueba) se borraron al terminar — la DB local quedó solo con el seed de John Doe.

## Bug encontrado y arreglado durante las pruebas

El escenario 18 (body inválido) reveló que la `Idempotency-Key` enviada junto a un body que falla la validación de Pydantic queda en `idempotency_keys` con `status = 'processing'` **para siempre** — el error ocurre en la fase de validación de FastAPI, antes de que el `try/except` del controller llegue a ejecutarse y poder liberarla. Un cliente que reintentara esa misma key (con el body ya corregido) quedaría bloqueado con `409 IDEMPOTENCY_KEY_CONFLICT` sin salida posible.

**Fix**: se agregó un timeout de 30s (`PROCESSING_TIMEOUT`) en `require_idempotency_key`. Una key en `processing` por menos de 30s se trata como un reintento concurrente genuino (`409`); una que lleva más de 30s se trata como abandonada, se borra y se permite un reintento limpio. Se verificó manualmente insertando filas `processing` con `created_at` artificial (fresca vs. 40s vieja): la fresca sigue devolviendo `409 IDEMPOTENCY_KEY_CONFLICT`, la vieja se deja pasar correctamente al negocio (devolvió `409 ACCOUNT_ALREADY_EXISTS`, confirmando que no fue bloqueada por idempotencia sino por la regla de negocio real).

Esto no reemplaza el job asíncrono de limpieza de `idempotency_keys` (`infra.md`, 2.2.5, fuera de alcance del MVP) — es la salvaguarda que evita que una key quede inutilizable mientras ese job no exista.

## No probado (ver nota en `requirements.md`)

- Concurrencia real con dos requests simultáneas sobre la misma cuenta (el último criterio de aceptación). El lock (`SELECT ... FOR UPDATE`) es correcto por construcción, pero dentro del alcance de Accounts/Cards no hay un escenario con un resultado de negocio observable para forzar la carrera (un toggle de freeze no tiene "lost update" significativo). Se prueba con un caso real en Spec 3 (dos compras/pagos simultáneos sobre el mismo cupo).

## Desvíos respecto al `design.md` original

- **Fix de idempotencia por staleness**: no estaba en la primera versión de `design.md`/`requirements.md` — se agregó tras encontrar el bug en las pruebas (ver arriba). Ambos documentos ya se actualizaron con el código final.

## Addendum (post Spec 5): `GET /accounts/me` sin cuenta deja de ser `404`

Al probar el Spec 5 en el navegador real, se cuestionó el diseño original: devolver `404 ACCOUNT_NOT_FOUND` cuando el usuario no tiene cuenta todavía trata un estado de negocio normal (cliente nuevo, antes de "Create card") como si fuera un error — obliga al frontend a usar manejo de excepciones para un caso esperado. Se cambió a `200` con `data: null`. Detalle completo de la decisión y el nuevo contrato en `requirements.md` ("Decisión revisada") y `design.md` (HU-2.2 actualizada). El resto de los endpoints de este spec que sí necesitan que la cuenta exista para operar mantienen `404 ACCOUNT_NOT_FOUND` sin cambios.

Se encontró de paso un problema de compatibilidad al aplicar el fix: el venv local corre Python 3.9 (no 3.12 como el `.python-version` fijado para Render en el Spec 0), y la sintaxis `dict | None` de tipos (PEP 604) no es válida en runtime antes de 3.10 — se usó `Optional[dict]` de `typing` en su lugar, consistente con el resto del código base que ya usaba `Optional` (ej. `app/core/errors.py`).

Verificado contra el backend real: `GET /accounts/me` sin cuenta → `{"statusCode":200,"message":"No account yet","data":null}`.

## Addendum (post Spec 6): se puede crear una cuenta nueva después de cancelar la anterior

Al diseñar "Cancel card" (Spec 6) se encontró un gap real: `create_account` chequeaba `db.query(Account).filter_by(user_id=user_id).first()` **sin filtrar por status** — una vez que existía una fila `closed` (de una cancelación previa), ese chequeo la encontraba igual y bloqueaba con `409 ACCOUNT_ALREADY_EXISTS` para siempre, sin ninguna forma de volver a crear una tarjeta. Lo mismo afectaba a `get_account_me`: devolvería la cuenta `closed` en vez de `data: null`, así que la Home nunca volvería a mostrar la silueta de "Create card" tras cancelar — contradiciendo lo que ya decía `requirements.md` de Spec 6.

**Decisión** (confirmada con el usuario): sí permitir recrear. Como no hay `UNIQUE` en `accounts.user_id` (Spec 1, intencional), un usuario puede terminar con varias filas de `accounts` a lo largo del tiempo — una `closed` vieja y, eventualmente, una nueva vigente. El fix no es solo en `get_account_me`/`create_account`: **cualquier** lugar del backend que busque "la cuenta del usuario" por `user_id` tenía el mismo riesgo. Se encontraron 8 call sites en total (Specs 2 y 3) y se centralizó la lógica en un helper nuevo:

```python
# app/shared/utils/account_lookup.py
def find_account_by_user(db: Session, user_id: UUID) -> Optional[Account]:
    return db.query(Account).filter_by(user_id=user_id).filter(Account.status != "closed").first()
```

Se reemplazaron los usos en este spec: `accounts/service.py` (`create_account`, `get_account_me`), y `locking.py` (`lock_account_by_user`, que necesita su propio `.with_for_update()` así que no reusa el helper, pero agrega el mismo filtro). El chequeo `if account.status == "closed": return "Cancelled"` dentro de `_resolve_display_status` quedó inalcanzable (una cuenta `closed` ya no llega nunca a esa función) — se sacó y se dejó un comentario explicando por qué. En la práctica, `Cancelled` pasa a ser un estado de `display_status` que nunca se renderiza (similar a cómo `mora`/`Overdue` ya eran parcialmente inalcanzables, `infra.md` sección 4).

**Verificado sin tocar datos reales**: como el usuario ya tenía una cuenta real de prueba (de probar Specs 4/5 en el navegador), la verificación se hizo con un `rollback()` explícito — se marcó la cuenta real como `closed` dentro de una transacción sin comitear, se confirmó que `find_account_by_user` la ignoraba, y se descartó el cambio. Un segundo intento (llamando a `accounts_service.create_account` directamente) reveló que esa función hace su propio `commit()` interno, lo que **comiteó por accidente** el cierre de la cuenta real + la creación de una cuenta de prueba — error de metodología, no del código. Se detectó enseguida, se restauró la cuenta real a su estado exacto anterior (`status`, `collateral_cents`) y se borró la cuenta de prueba; se confirmó contra `GET /accounts/me` y `GET /transactions` reales que no se perdió nada (los 8 movimientos de prueba del usuario seguían intactos).
