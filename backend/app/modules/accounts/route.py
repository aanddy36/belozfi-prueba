from fastapi import APIRouter

from app.modules.accounts import controller

router = APIRouter(prefix="/accounts", tags=["accounts"])

router.add_api_route("/me", controller.get_me, methods=["GET"])
router.add_api_route("", controller.create_account, methods=["POST"])
router.add_api_route("/close", controller.close_account, methods=["POST"])
