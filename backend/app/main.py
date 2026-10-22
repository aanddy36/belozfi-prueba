from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exception_handlers import register_exception_handlers
from app.db.session import get_db
from app.modules.accounts.route import router as accounts_router
from app.modules.cards.route import router as cards_router
from app.modules.collateral.route import router as collateral_router
from app.modules.payments.route import router as payments_router
from app.modules.purchases.route import router as purchases_router
from app.modules.transactions.route import router as transactions_router

app = FastAPI(title="Acme Credit API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)
app.include_router(accounts_router)
app.include_router(cards_router)
app.include_router(collateral_router)
app.include_router(purchases_router)
app.include_router(payments_router)
app.include_router(transactions_router)


@app.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "db": "ok"}
    except Exception as e:
        return {"status": "ok", "db": "error", "detail": str(e)}
