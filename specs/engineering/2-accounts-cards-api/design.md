# Spec 2 — Design

## Nota de alcance

`GET /health` (Spec 0) **no** se migra al nuevo envelope — ya está probado de punta a punta (Netlify → Render → Supabase) y el frontend de prueba de conexión depende de su forma actual (`{status, db}`). El envelope estándar aplica a partir de los endpoints de este spec en adelante.

Como no hay auth (ver `infra.md` sección 4.4) y el sistema tiene un único usuario, cada controller resuelve "el usuario actual" con un helper (`get_current_user`) que simplemente trae la única fila de `users` — no hay sesión, token ni header de identidad.

---

## 1. Infraestructura transversal

### 1.1 Respuesta estándar

```python
# app/core/responses.py
from typing import Any
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse


def success_response(data: Any = None, message: str = "OK", status_code: int = 200) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder({"statusCode": status_code, "message": message, "data": data}),
    )
```

### 1.2 Error de negocio (`AppError`)

```python
# app/core/errors.py
from typing import Any, Optional


class AppError(Exception):
    def __init__(self, status_code: int, code: str, message: str, details: Optional[Any] = None):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        super().__init__(message)
```

### 1.3 Exception handlers (los 4 casos que puede devolver la API)

```python
# app/core/exception_handlers.py
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from fastapi.responses import JSONResponse

from app.core.errors import AppError


def _error_response(status_code: int, message: str, code: str, details: object = None) -> JSONResponse:
    error = {"code": code}
    if details is not None:
        error["details"] = details
    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder({"statusCode": status_code, "message": message, "error": error}),
    )


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return _error_response(exc.status_code, exc.message, exc.code, exc.details)


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    details = [
        {"field": ".".join(str(p) for p in err["loc"] if p != "body"), "message": err["msg"]}
        for err in exc.errors()
    ]
    return _error_response(422, "Validation error", "VALIDATION_ERROR", details)


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return _error_response(exc.status_code, str(exc.detail), "HTTP_ERROR")


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return _error_response(500, "Internal server error", "INTERNAL_SERVER_ERROR")


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
```

### 1.4 Idempotencia

**Hallazgo de las pruebas funcionales**: un body inválido (422 de Pydantic) deja la key en `processing` para siempre, porque ese error ocurre en la fase de validación de FastAPI, antes de que el `try/except` del controller pueda liberarla — un reintento posterior con esa misma key (ya con el body corregido) quedaría bloqueado con `409 IDEMPOTENCY_KEY_CONFLICT` sin salida. Se agregó un timeout de "stale": una key en `processing` hace más de 30s se trata como abandonada y se permite un reintento limpio (se borra y se reinserta). La limpieza periódica real de keys viejas sigue siendo un job asíncrono fuera de alcance (`infra.md`, 2.2.5) — esto es solo la salvaguarda que evita que una key quede bloqueada para siempre mientras ese job no existe.

```python
# app/shared/utils/idempotency.py
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, Header, Request
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.session import get_db
from app.shared.models.idempotency_key import IdempotencyKey

PROCESSING_TIMEOUT = timedelta(seconds=30)


async def require_idempotency_key(
    request: Request,
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
) -> dict:
    if not idempotency_key:
        raise AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "Falta el header Idempotency-Key")

    body = await request.body()
    request_hash = hashlib.sha256(body).hexdigest()
    endpoint = request.url.path

    if _try_insert_key(db, idempotency_key, endpoint, request_hash):
        return {"key": idempotency_key}

    existing = db.query(IdempotencyKey).filter_by(key=idempotency_key).first()

    if existing.status == "completed":
        if existing.request_hash == request_hash:
            return {"cached_response": existing.response_body}
        raise AppError(409, "IDEMPOTENCY_KEY_CONFLICT", "La Idempotency-Key ya se usó con un body distinto")

    # status == "processing": reintento concurrente genuino, o key huérfana de un intento
    # anterior que nunca se completó ni se liberó.
    if existing.created_at >= datetime.now(timezone.utc) - PROCESSING_TIMEOUT:
        raise AppError(409, "IDEMPOTENCY_KEY_CONFLICT", "La Idempotency-Key ya está siendo procesada")

    db.query(IdempotencyKey).filter_by(key=idempotency_key).delete()
    db.commit()
    _try_insert_key(db, idempotency_key, endpoint, request_hash)
    return {"key": idempotency_key}


def _try_insert_key(db: Session, key: str, endpoint: str, request_hash: str) -> bool:
    stmt = (
        pg_insert(IdempotencyKey)
        .values(key=key, endpoint=endpoint, request_hash=request_hash, status="processing")
        .on_conflict_do_nothing(index_elements=["key"])
    )
    result = db.execute(stmt)
    db.commit()
    return result.rowcount > 0


def complete_idempotency_key(db: Session, key: str, response_body: dict) -> None:
    db.query(IdempotencyKey).filter_by(key=key).update({"status": "completed", "response_body": response_body})
    db.commit()


def release_idempotency_key(db: Session, key: str) -> None:
    db.query(IdempotencyKey).filter_by(key=key).delete()
    db.commit()
```

Uso en un controller (patrón que van a repetir todos los `POST`/`PATCH` con `Idempotency-Key`, acá y en Spec 3):

```python
async def create_account(payload: CreateAccountRequest, idem: dict = Depends(require_idempotency_key), db: Session = Depends(get_db)):
    if "cached_response" in idem:
        return success_response(data=idem["cached_response"], message="Account created successfully")
    try:
        account = accounts_service.create_account(db, user.id, payload.deposit_amount_cents)
        data = {"id": str(account.id), "status": account.status}
        complete_idempotency_key(db, idem["key"], data)
        return success_response(data=data, message="Account created successfully")
    except Exception:
        release_idempotency_key(db, idem["key"])
        raise
```

### 1.5 Lock de cuenta

```python
# app/shared/utils/locking.py
from uuid import UUID
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.modules.accounts.model import Account


def lock_account_by_user(db: Session, user_id: UUID) -> Account:
    account = db.query(Account).filter_by(user_id=user_id).with_for_update().first()
    if not account:
        raise AppError(404, "ACCOUNT_NOT_FOUND", "No existe una cuenta para este usuario")
    return account
```

*(Nota: este helper vive en `shared/utils` pero importa el modelo `Account` de `modules/accounts` — es la única dependencia cruzada de este tipo en el proyecto, aceptable dado que "la cuenta" es el recurso sobre el que se bloquea casi todo.)*

### 1.6 Ledger

```python
# app/shared/utils/ledger.py
from uuid import UUID
from sqlalchemy.orm import Session

from app.shared.models.ledger_entry import LedgerEntry


def record_ledger_entry(db: Session, account_id: UUID, entry_type: str, amount_cents: int, reference_type: str, reference_id: UUID) -> None:
    db.add(LedgerEntry(
        account_id=account_id,
        entry_type=entry_type,
        amount_cents=amount_cents,
        reference_type=reference_type,
        reference_id=reference_id,
    ))
```

### 1.7 Confirmación lazy de depósitos de garantía (compartido con Spec 3)

```python
# app/shared/utils/collateral_confirmation.py
from datetime import datetime, timedelta, timezone
from uuid import UUID
from sqlalchemy.orm import Session

from app.modules.accounts.model import Account
from app.modules.cards.model import Card
from app.modules.collateral.model import CollateralDeposit
from app.shared.utils.ledger import record_ledger_entry

CONFIRMATION_DELAY = timedelta(seconds=10)


def confirm_pending_deposits(db: Session, account_id: UUID) -> None:
    cutoff = datetime.now(timezone.utc) - CONFIRMATION_DELAY
    pending = (
        db.query(CollateralDeposit)
        .filter(
            CollateralDeposit.account_id == account_id,
            CollateralDeposit.status == "pending",
            CollateralDeposit.requested_at <= cutoff,
        )
        .all()
    )
    if not pending:
        return

    account = db.query(Account).filter_by(id=account_id).with_for_update().first()
    card = db.query(Card).filter_by(account_id=account_id).first()
    is_first_confirmation = account.status == "pending_collateral"

    for deposit in pending:
        deposit.status = "confirmed"
        deposit.confirmed_at = datetime.now(timezone.utc)
        account.collateral_cents += deposit.amount_cents
        account.credit_limit_cents += deposit.amount_cents
        account.available_credit_cents += deposit.amount_cents
        record_ledger_entry(db, account_id, "collateral_deposit", deposit.amount_cents, "collateral_deposit", deposit.id)

    if is_first_confirmation:
        account.status = "active"
        card.status = "active"
        card.activated_at = datetime.now(timezone.utc)

    db.commit()
```

### 1.8 Usuario actual (sin auth)

```python
# app/shared/utils/current_user.py
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.shared.models.user import User


def get_current_user(db: Session) -> User:
    user = db.query(User).first()
    if not user:
        raise AppError(500, "INTERNAL_SERVER_ERROR", "No hay ningún usuario cargado en el sistema")
    return user
```

### 1.9 Registro en `app/main.py`

Se agrega a lo que ya existe del Spec 0 (no se toca `/health`):

```python
from app.core.exception_handlers import register_exception_handlers
from app.modules.accounts.route import router as accounts_router
from app.modules.cards.route import router as cards_router

# ... app = FastAPI(...) ya existente ...

register_exception_handlers(app)
app.include_router(accounts_router)
app.include_router(cards_router)
```

---

## 2. Historias de Usuario

### Módulo: Accounts

#### HU-2.1 — Crear tarjeta garantizada

**Como** cliente sin cuenta, **quiero** depositar un monto de garantía **para** que se cree mi cuenta y tarjeta, y empezar a construir cupo.

**Reglas de negocio:**
- Mínimo $1.000 (`100000` centavos) — si no, `400 VALIDATION_ERROR`.
- Si el usuario ya tiene una cuenta, `409 ACCOUNT_ALREADY_EXISTS`.
- Crea `account` (`pending_collateral`), `card` (`inactive`, con número/exp/cvc generados), `collateral_deposit` (`pending`) — todo en una transacción.
- Requiere `Idempotency-Key`.

**Contrato:**
```
POST /accounts
Idempotency-Key: <uuid-del-cliente>
{ "deposit_amount_cents": 100000 }

200 →
{ "statusCode": 200, "message": "Account created successfully",
  "data": { "id": "...", "status": "pending_collateral" } }
```

**`app/modules/accounts/schema.py`:**
```python
from pydantic import BaseModel, Field


class CreateAccountRequest(BaseModel):
    deposit_amount_cents: int = Field(gt=0)
```

**`app/modules/accounts/service.py` (función `create_account`):**
```python
import secrets
from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.modules.accounts.model import Account
from app.modules.cards.model import Card
from app.modules.collateral.model import CollateralDeposit

MIN_DEPOSIT_CENTS = 100_000  # $1.000


def create_account(db: Session, user_id: UUID, deposit_amount_cents: int) -> Account:
    if deposit_amount_cents < MIN_DEPOSIT_CENTS:
        raise AppError(400, "VALIDATION_ERROR", "El depósito mínimo es de $1.000")

    if db.query(Account).filter_by(user_id=user_id).first():
        raise AppError(409, "ACCOUNT_ALREADY_EXISTS", "Ya existe una cuenta para este usuario")

    account = Account(user_id=user_id, status="pending_collateral")
    db.add(account)
    db.flush()  # para tener account.id antes de crear card/deposit (ver nota de Spec 1)

    card = Card(
        account_id=account.id,
        status="inactive",
        card_number=_generate_card_number(),
        exp_month=datetime.now(timezone.utc).month,
        exp_year=datetime.now(timezone.utc).year + 4,
        cvc=f"{secrets.randbelow(1000):03d}",
    )
    db.add(card)
    db.add(CollateralDeposit(account_id=account.id, amount_cents=deposit_amount_cents, status="pending"))

    db.commit()
    db.refresh(account)
    return account


def _generate_card_number() -> str:
    return "5" + "".join(str(secrets.randbelow(10)) for _ in range(15))
```

**`app/modules/accounts/controller.py` (función `create_account`):**
```python
from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.responses import success_response
from app.db.session import get_db
from app.modules.accounts import service as accounts_service
from app.modules.accounts.schema import CreateAccountRequest
from app.shared.utils.current_user import get_current_user
from app.shared.utils.idempotency import complete_idempotency_key, release_idempotency_key, require_idempotency_key


async def create_account(
    payload: CreateAccountRequest,
    idem: dict = Depends(require_idempotency_key),
    db: Session = Depends(get_db),
):
    if "cached_response" in idem:
        return success_response(data=idem["cached_response"], message="Account created successfully")
    try:
        user = get_current_user(db)
        account = accounts_service.create_account(db, user.id, payload.deposit_amount_cents)
        data = {"id": str(account.id), "status": account.status}
        complete_idempotency_key(db, idem["key"], data)
        return success_response(data=data, message="Account created successfully")
    except Exception:
        release_idempotency_key(db, idem["key"])
        raise
```

---

#### HU-2.2 — Ver el estado de mi cuenta

**Como** cliente, **quiero** consultar el estado de mi cuenta y tarjeta (incluyendo si mi depósito ya fue confirmado) **para** saber si puedo usar mi tarjeta y cuánto debo.

**Reglas de negocio:**
- Corre la confirmación lazy de depósitos pendientes antes de calcular cualquier otra cosa.
- `current_debt_cents` = suma de `pending_principal_cents + accrued_interest_cents` de las `purchases` `active` de la cuenta.
- `payment_due_date` = el próximo día 10 ≥ hoy. `statement_date` = día 20 del mes inmediatamente anterior a ese `payment_due_date`.
- `minimum_payment_cents` = 5% de `current_debt_cents`, mínimo $25 (o la deuda completa si es menor a $25).
- `display_status` con prioridad `Cancelled > Pending > Frozen > Overdue > Active`.
- `404 ACCOUNT_NOT_FOUND` si el usuario no tiene cuenta todavía.

**Contrato:**
```
GET /accounts/me

200 →
{ "statusCode": 200, "message": "Account retrieved successfully",
  "data": {
    "account": { "status": "active", "credit_limit_cents": 100000, "available_credit_cents": 55000, "collateral_cents": 100000 },
    "card": { "status": "active", "display_status": "Active" },
    "current_debt_cents": 45000,
    "statement_date": "2026-11-20",
    "payment_due_date": "2026-12-10",
    "minimum_payment_cents": 2500
  } }

404 → { "statusCode": 404, "message": "No existe una cuenta para este usuario", "error": { "code": "ACCOUNT_NOT_FOUND" } }
```

**`app/modules/accounts/service.py` (función `get_account_me`):**
```python
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.modules.accounts.model import Account
from app.modules.cards.model import Card
from app.modules.purchases.model import Purchase
from app.shared.utils.collateral_confirmation import confirm_pending_deposits

MIN_PAYMENT_CENTS = 2_500  # $25
MIN_PAYMENT_RATE = Decimal("0.05")


def get_account_me(db: Session, user_id: UUID) -> dict:
    account = db.query(Account).filter_by(user_id=user_id).first()
    if not account:
        raise AppError(404, "ACCOUNT_NOT_FOUND", "No existe una cuenta para este usuario")

    confirm_pending_deposits(db, account.id)
    db.refresh(account)
    card = db.query(Card).filter_by(account_id=account.id).first()

    current_debt_cents = (
        db.query(func.coalesce(func.sum(Purchase.pending_principal_cents + Purchase.accrued_interest_cents), 0))
        .filter(Purchase.account_id == account.id, Purchase.status == "active")
        .scalar()
    )

    today = datetime.now(timezone.utc).date()
    payment_due_date = _next_payment_due_date(today)
    statement_date = _add_months(payment_due_date, -1).replace(day=20)
    minimum_payment_cents = _minimum_payment(current_debt_cents)
    display_status = _resolve_display_status(account, card, current_debt_cents, payment_due_date, today)

    return {
        "account": account,
        "card": card,
        "display_status": display_status,
        "current_debt_cents": current_debt_cents,
        "statement_date": statement_date,
        "payment_due_date": payment_due_date,
        "minimum_payment_cents": minimum_payment_cents,
    }


def _next_payment_due_date(today: date) -> date:
    candidate = today.replace(day=10)
    return candidate if candidate >= today else _add_months(candidate, 1)


def _add_months(d: date, delta: int) -> date:
    month_index = d.month - 1 + delta
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    return d.replace(year=year, month=month)


def _minimum_payment(current_debt_cents: int) -> int:
    if current_debt_cents <= MIN_PAYMENT_CENTS:
        return current_debt_cents
    calculated = int((Decimal(current_debt_cents) * MIN_PAYMENT_RATE).to_integral_value(rounding=ROUND_HALF_UP))
    return max(calculated, MIN_PAYMENT_CENTS)


def _resolve_display_status(account: Account, card: Card, current_debt_cents: int, payment_due_date: date, today: date) -> str:
    if account.status == "closed":
        return "Cancelled"
    if card.status == "inactive":
        return "Pending"
    if card.status == "frozen":
        return "Frozen"
    if today > payment_due_date and current_debt_cents > 0:
        return "Overdue"
    return "Active"
```

**`app/modules/accounts/controller.py` (función `get_me`):**
```python
async def get_me(db: Session = Depends(get_db)):
    user = get_current_user(db)
    result = accounts_service.get_account_me(db, user.id)
    data = {
        "account": {
            "status": result["account"].status,
            "credit_limit_cents": result["account"].credit_limit_cents,
            "available_credit_cents": result["account"].available_credit_cents,
            "collateral_cents": result["account"].collateral_cents,
        },
        "card": {"status": result["card"].status, "display_status": result["display_status"]},
        "current_debt_cents": result["current_debt_cents"],
        "statement_date": result["statement_date"].isoformat(),
        "payment_due_date": result["payment_due_date"].isoformat(),
        "minimum_payment_cents": result["minimum_payment_cents"],
    }
    return success_response(data=data, message="Account retrieved successfully")
```

---

#### HU-2.3 — Cerrar mi cuenta

**Como** cliente sin deuda pendiente, **quiero** cerrar mi cuenta **para** recuperar mi garantía.

**Reglas de negocio:**
- `409 OUTSTANDING_BALANCE` si `current_debt_cents > 0`.
- Libera toda la garantía (`collateral_cents → 0`, con su entrada en el ledger) y pasa `account.status = closed`.
- Requiere `Idempotency-Key`.

**Contrato:**
```
POST /accounts/close
Idempotency-Key: <uuid-del-cliente>

200 → { "statusCode": 200, "message": "Account closed successfully", "data": { "id": "...", "status": "closed" } }
409 → { "statusCode": 409, "message": "No se puede cerrar la cuenta con deuda pendiente", "error": { "code": "OUTSTANDING_BALANCE" } }
```

**`app/modules/accounts/service.py` (función `close_account`):**
```python
from app.shared.utils.ledger import record_ledger_entry
from app.shared.utils.locking import lock_account_by_user


def close_account(db: Session, user_id: UUID) -> Account:
    account = lock_account_by_user(db, user_id)

    current_debt_cents = (
        db.query(func.coalesce(func.sum(Purchase.pending_principal_cents + Purchase.accrued_interest_cents), 0))
        .filter(Purchase.account_id == account.id, Purchase.status == "active")
        .scalar()
    )
    if current_debt_cents > 0:
        raise AppError(409, "OUTSTANDING_BALANCE", "No se puede cerrar la cuenta con deuda pendiente")

    if account.collateral_cents > 0:
        record_ledger_entry(db, account.id, "collateral_release", -account.collateral_cents, "account", account.id)
    account.collateral_cents = 0
    account.status = "closed"
    db.commit()
    db.refresh(account)
    return account
```

*(`amount_cents` negativo porque la garantía **sale** de la cuenta hacia el cliente — convención de signo ya establecida en `infra.md` para `ledger_entries`.)*

**`app/modules/accounts/controller.py` (función `close_account`):**
```python
async def close_account(idem: dict = Depends(require_idempotency_key), db: Session = Depends(get_db)):
    if "cached_response" in idem:
        return success_response(data=idem["cached_response"], message="Account closed successfully")
    try:
        user = get_current_user(db)
        account = accounts_service.close_account(db, user.id)
        data = {"id": str(account.id), "status": account.status}
        complete_idempotency_key(db, idem["key"], data)
        return success_response(data=data, message="Account closed successfully")
    except Exception:
        release_idempotency_key(db, idem["key"])
        raise
```

---

### Módulo: Cards

#### HU-2.4 — Congelar/descongelar mi tarjeta

**Como** cliente, **quiero** congelar o descongelar mi tarjeta **para** bloquear compras temporalmente sin cancelar la cuenta.

**Reglas de negocio:**
- `409 CARD_NOT_ACTIVE` si `cards.status == inactive` o `accounts.status == closed`.
- Toggle explícito por body (`frozen: true/false`), no requiere `Idempotency-Key` (ya es idempotente).

**Contrato:**
```
PATCH /cards/freeze
{ "frozen": true }

200 → { "statusCode": 200, "message": "Card updated successfully", "data": { "status": "frozen" } }
409 → { "statusCode": 409, "message": "La tarjeta no puede congelarse/descongelarse en este estado", "error": { "code": "CARD_NOT_ACTIVE" } }
```

**`app/modules/cards/schema.py`:**
```python
from pydantic import BaseModel


class FreezeCardRequest(BaseModel):
    frozen: bool
```

**`app/modules/cards/service.py`:**
```python
from uuid import UUID
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.modules.accounts.model import Account
from app.modules.cards.model import Card


def freeze_card(db: Session, user_id: UUID, frozen: bool) -> Card:
    account = db.query(Account).filter_by(user_id=user_id).first()
    if not account:
        raise AppError(404, "ACCOUNT_NOT_FOUND", "No existe una cuenta para este usuario")

    card = db.query(Card).filter_by(account_id=account.id).with_for_update().first()
    if card.status == "inactive" or account.status == "closed":
        raise AppError(409, "CARD_NOT_ACTIVE", "La tarjeta no puede congelarse/descongelarse en este estado")

    card.status = "frozen" if frozen else "active"
    db.commit()
    db.refresh(card)
    return card
```

**`app/modules/cards/controller.py` (función `freeze_card`):**
```python
from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.responses import success_response
from app.db.session import get_db
from app.modules.cards import service as cards_service
from app.modules.cards.schema import FreezeCardRequest
from app.shared.utils.current_user import get_current_user


async def freeze_card(payload: FreezeCardRequest, db: Session = Depends(get_db)):
    user = get_current_user(db)
    card = cards_service.freeze_card(db, user.id, payload.frozen)
    return success_response(data={"status": card.status}, message="Card updated successfully")
```

---

#### HU-2.5 — Ver el detalle de mi tarjeta

**Como** cliente con tarjeta activa, **quiero** ver el número completo, titular, vencimiento y CVC **para** usarlos si lo necesito.

**Reglas de negocio:**
- `409 CARD_INACTIVE` si `cards.status == inactive` — el dato ya existe en la fila (se generó en `POST /accounts`), pero se bloquea igual porque el negocio todavía no activó la tarjeta.
- `cardholder_name` sale de `users.name` (no se duplica en `cards`).

**Contrato:**
```
GET /cards/me/details

200 → { "statusCode": 200, "message": "Card details retrieved successfully",
        "data": { "card_number": "5555333344443333", "cardholder_name": "John Doe", "exp_month": 10, "exp_year": 2030, "cvc": "123" } }
409 → { "statusCode": 409, "message": "La tarjeta todavía no fue activada", "error": { "code": "CARD_INACTIVE" } }
```

**`app/modules/cards/schema.py` (agregado):**
```python
class CardDetailsResponse(BaseModel):
    card_number: str
    cardholder_name: str
    exp_month: int
    exp_year: int
    cvc: str
```

**`app/modules/cards/service.py` (función `get_card_details`):**
```python
from app.shared.models.user import User


def get_card_details(db: Session, user_id: UUID) -> dict:
    account = db.query(Account).filter_by(user_id=user_id).first()
    if not account:
        raise AppError(404, "ACCOUNT_NOT_FOUND", "No existe una cuenta para este usuario")

    card = db.query(Card).filter_by(account_id=account.id).first()
    if card.status == "inactive":
        raise AppError(409, "CARD_INACTIVE", "La tarjeta todavía no fue activada")

    user = db.query(User).filter_by(id=user_id).first()
    return {
        "card_number": card.card_number,
        "cardholder_name": user.name,
        "exp_month": card.exp_month,
        "exp_year": card.exp_year,
        "cvc": card.cvc,
    }
```

**`app/modules/cards/controller.py` (función `get_card_details`):**
```python
async def get_card_details(db: Session = Depends(get_db)):
    user = get_current_user(db)
    details = cards_service.get_card_details(db, user.id)
    return success_response(data=details, message="Card details retrieved successfully")
```

---

## 3. `route.py` de cada módulo

```python
# app/modules/accounts/route.py
from fastapi import APIRouter
from app.modules.accounts import controller

router = APIRouter(prefix="/accounts", tags=["accounts"])
router.add_api_route("/me", controller.get_me, methods=["GET"])
router.add_api_route("", controller.create_account, methods=["POST"])
router.add_api_route("/close", controller.close_account, methods=["POST"])
```

```python
# app/modules/cards/route.py
from fastapi import APIRouter
from app.modules.cards import controller

router = APIRouter(prefix="/cards", tags=["cards"])
router.add_api_route("/freeze", controller.freeze_card, methods=["PATCH"])
router.add_api_route("/me/details", controller.get_card_details, methods=["GET"])
```

## Nota para Spec 3

`require_idempotency_key` / `complete_idempotency_key` / `release_idempotency_key` (1.4), `lock_account_by_user` (1.5), `record_ledger_entry` (1.6), `confirm_pending_deposits` (1.7) y `get_current_user` (1.8) son de uso directo para Collateral/Purchases/Payments — no hay que reescribir nada, solo importarlos.
