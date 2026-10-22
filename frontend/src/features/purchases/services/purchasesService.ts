import { apiFetch, generateIdempotencyKey } from '@/api/client'

export type InstallmentPlan = 1 | 3 | 6 | 12

interface Purchase {
  id: string
  merchant_name: string
  amount_cents: number
  installment_plan: InstallmentPlan
  status: string
}

export function createPurchase(
  merchantName: string,
  amountCents: number,
  installmentPlan: InstallmentPlan
): Promise<Purchase> {
  return apiFetch('/purchases', {
    method: 'POST',
    headers: { 'Idempotency-Key': generateIdempotencyKey() },
    body: JSON.stringify({
      merchant_name: merchantName,
      amount_cents: amountCents,
      installment_plan: installmentPlan,
    }),
  })
}
