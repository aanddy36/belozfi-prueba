# Spec 3 — Design

## Nota de alcance

Todo lo transversal (envelope, `AppError`, idempotencia con el fix de staleness, `lock_account_by_user`, `record_ledger_entry`, `confirm_pending_deposits`, `get_current_user`) ya existe del Spec 2 — este spec solo lo importa, no lo reescribe.

`Transactions` no tiene modelo propio (no es una tabla, es una consulta compuesta sobre `purchases`+`payments`) — su carpeta de módulo solo tiene `service.py`/`controller.py`/`route.py`, sin `model.py` ni `schema.py` (no recibe body, solo query params).

---

## 1. Módulo: Collateral

### HU-3.1 — Agregar garantía adicional

**Como** cliente con cuenta activa, **quiero** depositar garantía adicional **para** aumentar mi cupo disponible.

**Reglas de negocio:**
- Mínimo $1.000 (mismo piso que el depósito inicial) — `400 VALIDATION_ERROR` si no.
- `404 ACCOUNT_NOT_FOUND` si no hay cuenta. `409 ACCOUNT_CLOSED` si la cuenta ya está cerrada.
- Crea el depósito en `pending` — la confirmación lazy (10s) la corre `GET /accounts/me` o `GET /collateral-deposits`, no este endpoint.
- Requiere `Idempotency-Key`.

**Contrato:**
```
POST /collateral-deposits
Idempotency-Key: <uuid>
{ "amount_cents": 50000 }

200 → { "statusCode": 200, "message": "Collateral deposit created successfully",
        "data": { "id": "...", "amount_cents": 50000, "status": "pending" } }
409 → { "statusCode": 409, "message": "No se puede depositar garantía en una cuenta cerrada", "error": { "code": "ACCOUNT_CLOSED" } }
```

**`app/modules/collateral/schema.py`:**
```python
from pydantic import BaseModel, Field


class CreateCollateralDepositRequest(BaseModel):
    amount_cents: int = Field(gt=0)
```

**`app/modules/collateral/service.py`:**
```python
from uuid import UUID
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.modules.accounts.model import Account
from app.modules.collateral.model import CollateralDeposit
from app.shared.utils.collateral_confirmation import confirm_pending_deposits

MIN_DEPOSIT_CENTS = 100_000  # $1.000, mismo piso que Spec 2


def create_collateral_deposit(db: Session, user_id: UUID, amount_cents: int) -> CollateralDeposit:
    if amount_cents < MIN_DEPOSIT_CENTS:
        raise AppError(400, "VALIDATION_ERROR", "El depósito mínimo es de $1.000")

    account = db.query(Account).filter_by(user_id=user_id).first()
    if not account:
        raise AppError(404, "ACCOUNT_NOT_FOUND", "No existe una cuenta para este usuario")
    if account.status == "closed":
        raise AppError(409, "ACCOUNT_CLOSED", "No se puede depositar garantía en una cuenta cerrada")

    deposit = CollateralDeposit(account_id=account.id, amount_cents=amount_cents, status="pending")
    db.add(deposit)
    db.commit()
    db.refresh(deposit)
    return deposit


def list_collateral_deposits(db: Session, user_id: UUID) -> list[CollateralDeposit]:
    account = db.query(Account).filter_by(user_id=user_id).first()
    if not account:
        raise AppError(404, "ACCOUNT_NOT_FOUND", "No existe una cuenta para este usuario")

    confirm_pending_deposits(db, account.id)

    return (
        db.query(CollateralDeposit)
        .filter_by(account_id=account.id)
        .order_by(CollateralDeposit.requested_at.desc())
        .all()
    )
```

**`app/modules/collateral/controller.py`:**
```python
from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.responses import success_response
from app.db.session import get_db
from app.modules.collateral import service as collateral_service
from app.modules.collateral.schema import CreateCollateralDepositRequest
from app.shared.utils.current_user import get_current_user
from app.shared.utils.idempotency import (
    complete_idempotency_key,
    release_idempotency_key,
    require_idempotency_key,
)


async def create_collateral_deposit(
    payload: CreateCollateralDepositRequest,
    idem: dict = Depends(require_idempotency_key),
    db: Session = Depends(get_db),
):
    if "cached_response" in idem:
        return success_response(data=idem["cached_response"], message="Collateral deposit created successfully")
    try:
        user = get_current_user(db)
        deposit = collateral_service.create_collateral_deposit(db, user.id, payload.amount_cents)
        data = {"id": str(deposit.id), "amount_cents": deposit.amount_cents, "status": deposit.status}
        complete_idempotency_key(db, idem["key"], data)
        return success_response(data=data, message="Collateral deposit created successfully")
    except Exception:
        release_idempotency_key(db, idem["key"])
        raise
```

---

### HU-3.2 — Ver mis depósitos de garantía

**Como** cliente, **quiero** ver la lista de todos mis depósitos de garantía (con su estado) **para** saber cuánto tengo confirmado y cuánto sigue pendiente.

**Contrato:**
```
GET /collateral-deposits

200 → { "statusCode": 200, "message": "Collateral deposits retrieved successfully",
        "data": [
          { "id": "...", "amount_cents": 100000, "status": "confirmed", "requested_at": "...", "confirmed_at": "..." },
          { "id": "...", "amount_cents": 50000, "status": "pending", "requested_at": "...", "confirmed_at": null }
        ] }
```

**`app/modules/collateral/controller.py` (función `list_collateral_deposits`):**
```python
async def list_collateral_deposits(db: Session = Depends(get_db)):
    user = get_current_user(db)
    deposits = collateral_service.list_collateral_deposits(db, user.id)
    data = [
        {
            "id": str(d.id),
            "amount_cents": d.amount_cents,
            "status": d.status,
            "requested_at": d.requested_at.isoformat(),
            "confirmed_at": d.confirmed_at.isoformat() if d.confirmed_at else None,
        }
        for d in deposits
    ]
    return success_response(data=data, message="Collateral deposits retrieved successfully")
```

**`app/modules/collateral/route.py`:**
```python
from fastapi import APIRouter

from app.modules.collateral import controller

router = APIRouter(prefix="/collateral-deposits", tags=["collateral"])
router.add_api_route("", controller.create_collateral_deposit, methods=["POST"])
router.add_api_route("", controller.list_collateral_deposits, methods=["GET"])
```

---

## 2. Módulo: Purchases

### HU-3.3 — Simular una compra

**Como** cliente con tarjeta activa, **quiero** simular una compra en 1/3/6/12 cuotas **para** probar la autorización contra mi cupo disponible.

**Reglas de negocio:**
- `409 CARD_NOT_ACTIVE` si `accounts.status != active` o `cards.status != active`.
- `409 INSUFFICIENT_CREDIT` si `amount_cents > available_credit_cents`.
- `monthly_rate`: `0` si `installment_plan == 1`, `0.02` si `3`/`6`/`12`.
- `pending_principal_cents = amount_cents`, `accrued_interest_cents = 0` al crear (nunca se acumula interés real en este MVP).
- Descuenta `amount_cents` de `available_credit_cents` dentro de la misma transacción con lock — esto es lo que hace que dos compras simultáneas al límite del cupo se serialicen correctamente.
- Requiere `Idempotency-Key`.

**Contrato:**
```
POST /purchases
Idempotency-Key: <uuid>
{ "merchant_name": "DECATHLON", "amount_cents": 60000, "installment_plan": 6 }

200 → { "statusCode": 200, "message": "Purchase created successfully",
        "data": { "id": "...", "merchant_name": "DECATHLON", "amount_cents": 60000, "installment_plan": 6, "status": "active" } }
409 → { "statusCode": 409, "message": "El monto excede el cupo disponible", "error": { "code": "INSUFFICIENT_CREDIT" } }
```

**`app/modules/purchases/schema.py`:**
```python
from typing import Literal
from pydantic import BaseModel, Field


class CreatePurchaseRequest(BaseModel):
    merchant_name: str = Field(min_length=1)
    amount_cents: int = Field(gt=0)
    installment_plan: Literal[1, 3, 6, 12]
```

**`app/modules/purchases/service.py`:**
```python
from decimal import Decimal
from uuid import UUID
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.modules.cards.model import Card
from app.modules.purchases.model import Purchase
from app.shared.utils.ledger import record_ledger_entry
from app.shared.utils.locking import lock_account_by_user

MONTHLY_RATE_FINANCED = Decimal("0.02")
MONTHLY_RATE_SINGLE = Decimal("0")


def create_purchase(
    db: Session, user_id: UUID, merchant_name: str, amount_cents: int, installment_plan: int
) -> Purchase:
    account = lock_account_by_user(db, user_id)
    card = db.query(Card).filter_by(account_id=account.id).first()

    if account.status != "active" or card.status != "active":
        raise AppError(409, "CARD_NOT_ACTIVE", "La tarjeta no está activa para realizar compras")

    if amount_cents > account.available_credit_cents:
        raise AppError(409, "INSUFFICIENT_CREDIT", "El monto excede el cupo disponible")

    monthly_rate = MONTHLY_RATE_SINGLE if installment_plan == 1 else MONTHLY_RATE_FINANCED

    purchase = Purchase(
        account_id=account.id,
        merchant_name=merchant_name,
        amount_cents=amount_cents,
        installment_plan=installment_plan,
        monthly_rate=monthly_rate,
        pending_principal_cents=amount_cents,
        accrued_interest_cents=0,
        status="active",
    )
    db.add(purchase)
    account.available_credit_cents -= amount_cents
    db.flush()  # para tener purchase.id antes de postear al ledger

    record_ledger_entry(db, account.id, "purchase", -amount_cents, "purchase", purchase.id)

    db.commit()
    db.refresh(purchase)
    return purchase
```

**`app/modules/purchases/controller.py`:**
```python
from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.responses import success_response
from app.db.session import get_db
from app.modules.purchases import service as purchases_service
from app.modules.purchases.schema import CreatePurchaseRequest
from app.shared.utils.current_user import get_current_user
from app.shared.utils.idempotency import (
    complete_idempotency_key,
    release_idempotency_key,
    require_idempotency_key,
)


async def create_purchase(
    payload: CreatePurchaseRequest,
    idem: dict = Depends(require_idempotency_key),
    db: Session = Depends(get_db),
):
    if "cached_response" in idem:
        return success_response(data=idem["cached_response"], message="Purchase created successfully")
    try:
        user = get_current_user(db)
        purchase = purchases_service.create_purchase(
            db, user.id, payload.merchant_name, payload.amount_cents, payload.installment_plan
        )
        data = {
            "id": str(purchase.id),
            "merchant_name": purchase.merchant_name,
            "amount_cents": purchase.amount_cents,
            "installment_plan": purchase.installment_plan,
            "status": purchase.status,
        }
        complete_idempotency_key(db, idem["key"], data)
        return success_response(data=data, message="Purchase created successfully")
    except Exception:
        release_idempotency_key(db, idem["key"])
        raise
```

**`app/modules/purchases/route.py`:**
```python
from fastapi import APIRouter

from app.modules.purchases import controller

router = APIRouter(prefix="/purchases", tags=["purchases"])
router.add_api_route("", controller.create_purchase, methods=["POST"])
```

---

## 3. Módulo: Payments

### HU-3.4 — Pagar mi deuda

**Como** cliente con deuda, **quiero** pagar un monto (mínimo, total, u otro) **para** reducir mi deuda y recuperar cupo.

**Reglas de negocio:**
- `409 PAYMENT_EXCEEDS_DEBT` si `amount_cents > current_debt_cents`.
- `409 PAYMENT_BELOW_MINIMUM` si `amount_cents < min(2500, current_debt_cents)`.
- Reparto FIFO por `authorized_at` ascendente entre las `purchases` `active`: dentro de cada compra, primero interés acumulado, después capital (en la práctica el interés siempre es 0, pero la lógica queda correcta de todos modos).
- Una fila en `payment_allocations` por cada compra tocada (monto total aplicado a esa compra, sin desglosar interés/capital — esa tabla no tiene esa columna).
- **Solo la porción de capital pagada** restaura `available_credit_cents` — la de interés no, porque el interés nunca redujo el cupo en primer lugar.
- `purchases.status = paid` cuando su saldo (capital + interés) llega a 0.
- Requiere `Idempotency-Key`.

**Contrato:**
```
POST /payments
Idempotency-Key: <uuid>
{ "amount_cents": 40000 }

200 → { "statusCode": 200, "message": "Payment created successfully", "data": { "id": "...", "amount_cents": 40000 } }
409 → { "statusCode": 409, "message": "El pago excede la deuda total", "error": { "code": "PAYMENT_EXCEEDS_DEBT" } }
```

**`app/modules/payments/schema.py`:**
```python
from pydantic import BaseModel, Field


class CreatePaymentRequest(BaseModel):
    amount_cents: int = Field(gt=0)
```

**`app/modules/payments/service.py`:**
```python
from uuid import UUID
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.modules.payments.model import Payment, PaymentAllocation
from app.modules.purchases.model import Purchase
from app.shared.utils.ledger import record_ledger_entry
from app.shared.utils.locking import lock_account_by_user

MIN_PAYMENT_CENTS = 2_500  # $25, mismo piso que Spec 2


def create_payment(db: Session, user_id: UUID, amount_cents: int) -> Payment:
    account = lock_account_by_user(db, user_id)

    purchases = (
        db.query(Purchase)
        .filter(Purchase.account_id == account.id, Purchase.status == "active")
        .order_by(Purchase.authorized_at.asc())
        .all()
    )
    current_debt_cents = sum(p.pending_principal_cents + p.accrued_interest_cents for p in purchases)

    if amount_cents > current_debt_cents:
        raise AppError(409, "PAYMENT_EXCEEDS_DEBT", "El pago excede la deuda total")

    minimum_required = min(MIN_PAYMENT_CENTS, current_debt_cents)
    if amount_cents < minimum_required:
        raise AppError(409, "PAYMENT_BELOW_MINIMUM", "El pago es menor al mínimo permitido")

    payment = Payment(account_id=account.id, amount_cents=amount_cents)
    db.add(payment)
    db.flush()  # para tener payment.id

    remaining = amount_cents
    for purchase in purchases:
        if remaining <= 0:
            break
        purchase_balance = purchase.pending_principal_cents + purchase.accrued_interest_cents
        if purchase_balance <= 0:
            continue

        applied = min(remaining, purchase_balance)
        interest_paid = min(applied, purchase.accrued_interest_cents)
        principal_paid = applied - interest_paid

        purchase.accrued_interest_cents -= interest_paid
        purchase.pending_principal_cents -= principal_paid
        if purchase.pending_principal_cents == 0 and purchase.accrued_interest_cents == 0:
            purchase.status = "paid"

        db.add(PaymentAllocation(payment_id=payment.id, purchase_id=purchase.id, amount_cents=applied))
        account.available_credit_cents += principal_paid
        remaining -= applied

    record_ledger_entry(db, account.id, "payment", amount_cents, "payment", payment.id)

    db.commit()
    db.refresh(payment)
    return payment
```

*(No se agrega `.with_for_update()` sobre `purchases` acá: el lock de `accounts` ya serializa cualquier otra operación financiera sobre la misma cuenta — compras, pagos, cierre —, y ninguna otra ruta del sistema muta `purchases` fuera de este flujo, así que un segundo lock sería redundante.)*

**`app/modules/payments/controller.py`:**
```python
from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.responses import success_response
from app.db.session import get_db
from app.modules.payments import service as payments_service
from app.modules.payments.schema import CreatePaymentRequest
from app.shared.utils.current_user import get_current_user
from app.shared.utils.idempotency import (
    complete_idempotency_key,
    release_idempotency_key,
    require_idempotency_key,
)


async def create_payment(
    payload: CreatePaymentRequest,
    idem: dict = Depends(require_idempotency_key),
    db: Session = Depends(get_db),
):
    if "cached_response" in idem:
        return success_response(data=idem["cached_response"], message="Payment created successfully")
    try:
        user = get_current_user(db)
        payment = payments_service.create_payment(db, user.id, payload.amount_cents)
        data = {"id": str(payment.id), "amount_cents": payment.amount_cents}
        complete_idempotency_key(db, idem["key"], data)
        return success_response(data=data, message="Payment created successfully")
    except Exception:
        release_idempotency_key(db, idem["key"])
        raise
```

**`app/modules/payments/route.py`:**
```python
from fastapi import APIRouter

from app.modules.payments import controller

router = APIRouter(prefix="/payments", tags=["payments"])
router.add_api_route("", controller.create_payment, methods=["POST"])
```

---

## 4. Módulo: Transactions

### HU-3.5 — Ver mis movimientos

**Como** cliente, **quiero** ver mis compras y pagos mezclados en una sola lista, ordenados por fecha **para** entender mi actividad reciente.

**Reglas de negocio:**
- `UNION ALL` de `purchases` (monto negativo) y `payments` (monto positivo), ordenado por fecha descendente, paginado.
- `merchant_name` es `null` en los ítems de tipo `payment` (esa tabla no tiene ese campo).
- Mismo endpoint sirve a la Home (`page_size=6`) y a `/transactions` (`page_size=20` por default).

**Contrato:**
```
GET /transactions?page=1&page_size=20

200 → { "statusCode": 200, "message": "Transactions retrieved successfully",
        "data": {
          "items": [
            { "type": "purchase", "merchant_name": "DECATHLON", "amount_cents": -60000, "date": "2026-10-20" },
            { "type": "payment", "merchant_name": null, "amount_cents": 40000, "date": "2026-10-15" }
          ],
          "total": 2
        } }
```

**`app/modules/transactions/service.py`:**
```python
from uuid import UUID
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.modules.accounts.model import Account

_UNION_QUERY = text(
    """
    SELECT 'purchase' AS type, merchant_name, -amount_cents AS amount_cents, authorized_at AS date
    FROM purchases WHERE account_id = :account_id
    UNION ALL
    SELECT 'payment' AS type, NULL AS merchant_name, amount_cents, applied_at AS date
    FROM payments WHERE account_id = :account_id
    ORDER BY date DESC
    LIMIT :limit OFFSET :offset
    """
)

_COUNT_QUERY = text(
    """
    SELECT
        (SELECT count(*) FROM purchases WHERE account_id = :account_id) +
        (SELECT count(*) FROM payments WHERE account_id = :account_id)
    """
)


def list_transactions(db: Session, user_id: UUID, page: int, page_size: int) -> dict:
    account = db.query(Account).filter_by(user_id=user_id).first()
    if not account:
        raise AppError(404, "ACCOUNT_NOT_FOUND", "No existe una cuenta para este usuario")

    offset = (page - 1) * page_size
    rows = db.execute(
        _UNION_QUERY, {"account_id": account.id, "limit": page_size, "offset": offset}
    ).mappings().all()
    total = db.execute(_COUNT_QUERY, {"account_id": account.id}).scalar()

    items = [
        {
            "type": row["type"],
            "merchant_name": row["merchant_name"],
            "amount_cents": row["amount_cents"],
            "date": row["date"].isoformat(),
        }
        for row in rows
    ]
    return {"items": items, "total": total}
```

**`app/modules/transactions/controller.py`:**
```python
from fastapi import Depends, Query
from sqlalchemy.orm import Session

from app.core.responses import success_response
from app.db.session import get_db
from app.modules.transactions import service as transactions_service
from app.shared.utils.current_user import get_current_user


async def list_transactions(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    user = get_current_user(db)
    result = transactions_service.list_transactions(db, user.id, page, page_size)
    return success_response(data=result, message="Transactions retrieved successfully")
```

**`app/modules/transactions/route.py`:**
```python
from fastapi import APIRouter

from app.modules.transactions import controller

router = APIRouter(prefix="/transactions", tags=["transactions"])
router.add_api_route("", controller.list_transactions, methods=["GET"])
```

---

## 5. Registro en `app/main.py`

Se agrega a lo que ya existe de Specs 0/2:

```python
from app.modules.collateral.route import router as collateral_router
from app.modules.payments.route import router as payments_router
from app.modules.purchases.route import router as purchases_router
from app.modules.transactions.route import router as transactions_router

# ... después de los include_router de accounts/cards ...
app.include_router(collateral_router)
app.include_router(purchases_router)
app.include_router(payments_router)
app.include_router(transactions_router)
```

## 6. Nota sobre la prueba de concurrencia real

El criterio de aceptación de `requirements.md` pide probar con **requests concurrentes reales** (no secuenciales) que dos compras simultáneas al límite del cupo no pasen ambas. Esto requiere, al implementar, lanzar 2+ requests HTTP en paralelo (ej. `concurrent.futures.ThreadPoolExecutor` contra un server real corriendo) y verificar que exactamente una devuelve `200` y la otra `409 INSUFFICIENT_CREDIT` — no alcanza con probarlo de a una.
