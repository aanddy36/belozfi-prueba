import { apiFetch, generateIdempotencyKey } from '@/api/client'

export function createPayment(amountCents: number): Promise<{ id: string; amount_cents: number }> {
  return apiFetch('/payments', {
    method: 'POST',
    headers: { 'Idempotency-Key': generateIdempotencyKey() },
    body: JSON.stringify({ amount_cents: amountCents }),
  })
}
