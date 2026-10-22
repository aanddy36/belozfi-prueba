import { apiFetch } from '@/api/client'
import type { CardDetails } from '@/common/types/card'

export function freezeCard(frozen: boolean): Promise<{ status: string }> {
  return apiFetch('/cards/freeze', {
    method: 'PATCH',
    body: JSON.stringify({ frozen }),
  })
}

export function getCardDetails(): Promise<CardDetails> {
  return apiFetch<CardDetails>('/cards/me/details')
}
