import { apiFetch, generateIdempotencyKey } from '@/api/client'
import type { CollateralDeposit } from '@/common/types/collateral'

export function createCollateralDeposit(
  amountCents: number
): Promise<{ id: string; amount_cents: number; status: string }> {
  return apiFetch('/collateral-deposits', {
    method: 'POST',
    headers: { 'Idempotency-Key': generateIdempotencyKey() },
    body: JSON.stringify({ amount_cents: amountCents }),
  })
}

export function listCollateralDeposits(): Promise<CollateralDeposit[]> {
  return apiFetch<CollateralDeposit[]>('/collateral-deposits')
}
