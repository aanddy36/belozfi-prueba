from pydantic import BaseModel, Field


class CreateCollateralDepositRequest(BaseModel):
    amount_cents: int = Field(gt=0)
