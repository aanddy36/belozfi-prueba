import { format, parseISO } from 'date-fns'
import type { ReactNode } from 'react'
import { formatCents } from '@/common/utils/money'

interface AccountGridProps {
  availableCreditCents: number
  creditLimitCents: number
  statementDate: string
  minimumPaymentCents: number
  paymentDueDate: string
}

function formatDate(isoDate: string): string {
  return format(parseISO(isoDate), 'MMM d, yyyy')
}

export function AccountGrid({
  availableCreditCents,
  creditLimitCents,
  statementDate,
  minimumPaymentCents,
  paymentDueDate,
}: AccountGridProps) {
  return (
    <div className="grid w-full max-w-md grid-cols-2 gap-4">
      <GridCell label="Available limit" value={formatCents(availableCreditCents)}>
        <span className="text-xs text-muted-foreground">of {formatCents(creditLimitCents)}</span>
      </GridCell>
      <GridCell label="Statement date" value={formatDate(statementDate)} />
      <GridCell label="Minimum payment" value={formatCents(minimumPaymentCents)} />
      <GridCell label="Payment due date" value={formatDate(paymentDueDate)} />
    </div>
  )
}

function GridCell({
  label,
  value,
  children,
}: {
  label: string
  value: string
  children?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-foreground">{value}</p>
      {children}
    </div>
  )
}
