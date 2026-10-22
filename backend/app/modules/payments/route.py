from fastapi import APIRouter

from app.modules.payments import controller

router = APIRouter(prefix="/payments", tags=["payments"])

router.add_api_route("", controller.create_payment, methods=["POST"])
