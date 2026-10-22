from fastapi import APIRouter

from app.modules.purchases import controller

router = APIRouter(prefix="/purchases", tags=["purchases"])

router.add_api_route("", controller.create_purchase, methods=["POST"])
