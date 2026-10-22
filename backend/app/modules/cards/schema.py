from pydantic import BaseModel


class FreezeCardRequest(BaseModel):
    frozen: bool


class CardDetailsResponse(BaseModel):
    card_number: str
    cardholder_name: str
    exp_month: int
    exp_year: int
    cvc: str
