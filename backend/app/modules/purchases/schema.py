from typing import Literal

from pydantic import BaseModel, Field


class CreatePurchaseRequest(BaseModel):
    merchant_name: str = Field(min_length=1)
    amount_cents: int = Field(gt=0)
    installment_plan: Literal[1, 3, 6, 12]
