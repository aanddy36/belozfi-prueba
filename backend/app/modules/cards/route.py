from fastapi import APIRouter

from app.modules.cards import controller

router = APIRouter(prefix="/cards", tags=["cards"])

router.add_api_route("/freeze", controller.freeze_card, methods=["PATCH"])
router.add_api_route("/me/details", controller.get_card_details, methods=["GET"])
