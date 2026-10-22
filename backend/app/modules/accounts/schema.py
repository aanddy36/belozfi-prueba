from pydantic import BaseModel, Field


class CreateAccountRequest(BaseModel):
    deposit_amount_cents: int = Field(gt=0)
