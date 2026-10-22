import { apiFetch, generateIdempotencyKey } from '@/api/client'
import type { AccountMe } from '@/common/types/account'

export function getAccountMe(): Promise<AccountMe | null> {
  return apiFetch<AccountMe | null>('/accounts/me')
}

export function createAccount(depositAmountCents: number): Promise<{ id: string; status: string }> {
  return apiFetch('/accounts', {
    method: 'POST',
    headers: { 'Idempotency-Key': generateIdempotencyKey() },
    body: JSON.stringify({ deposit_amount_cents: depositAmountCents }),
  })
}
