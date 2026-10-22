export interface TransactionItem {
  type: 'purchase' | 'payment'
  merchant_name: string | null
  amount_cents: number
  date: string
}

export interface TransactionsPage {
  items: TransactionItem[]
  total: number
}
