export interface CollateralDeposit {
  id: string
  amount_cents: number
  status: 'pending' | 'confirmed'
  requested_at: string
  confirmed_at: string | null
}
