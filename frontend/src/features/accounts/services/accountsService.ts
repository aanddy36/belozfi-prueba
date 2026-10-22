import { apiFetch } from '@/api/client'
import type { AccountMe } from '@/common/types/account'

export function getAccountMe(): Promise<AccountMe> {
  return apiFetch<AccountMe>('/accounts/me')
}
