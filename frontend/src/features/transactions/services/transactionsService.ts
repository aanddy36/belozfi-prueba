import { apiFetch } from '@/api/client'
import type { TransactionsPage } from '@/common/types/transaction'

export function listTransactions(page: number, pageSize: number): Promise<TransactionsPage> {
  return apiFetch<TransactionsPage>(`/transactions?page=${page}&page_size=${pageSize}`)
}
