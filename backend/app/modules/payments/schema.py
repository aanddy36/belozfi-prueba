from pydantic import BaseModel, Field


class CreatePaymentRequest(BaseModel):
    amount_cents: int = Field(gt=0)
