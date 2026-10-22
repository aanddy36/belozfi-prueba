from fastapi import APIRouter

from app.modules.collateral import controller

router = APIRouter(prefix="/collateral-deposits", tags=["collateral"])

router.add_api_route("", controller.create_collateral_deposit, methods=["POST"])
router.add_api_route("", controller.list_collateral_deposits, methods=["GET"])
