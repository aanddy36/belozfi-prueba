from fastapi import APIRouter

from app.modules.transactions import controller

router = APIRouter(prefix="/transactions", tags=["transactions"])

router.add_api_route("", controller.list_transactions, methods=["GET"])
