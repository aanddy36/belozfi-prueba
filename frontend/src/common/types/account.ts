export type AccountStatus = 'pending_collateral' | 'active' | 'frozen' | 'mora' | 'closed'
export type CardStatus = 'inactive' | 'active' | 'frozen'
export type DisplayStatus = 'Pending' | 'Active' | 'Frozen' | 'Cancelled' | 'Overdue'

export interface AccountSummary {
  status: AccountStatus
  credit_limit_cents: number
  available_credit_cents: number
  collateral_cents: number
}

export interface CardSummary {
  status: CardStatus
  display_status: DisplayStatus
}

export interface AccountMe {
  account: AccountSummary
  card: CardSummary
  current_debt_cents: number
  statement_date: string
  payment_due_date: string
  minimum_payment_cents: number
}
