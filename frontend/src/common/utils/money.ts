export function formatCents(amountCents: number): string {
  const amount = amountCents / 100
  const sign = amount < 0 ? '-' : ''
  const formatted = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `$ ${sign}${formatted}`
}
