import { format, parseISO } from 'date-fns'
import { AcmeLogo } from '@/common/components/AcmeLogo'
import { formatCents } from '@/common/utils/money'
import type { CollateralDeposit } from '@/common/types/collateral'

const STATUS_DOT_COLOR: Record<CollateralDeposit['status'], string> = {
  pending: 'bg-amber-400',
  confirmed: 'bg-emerald-500',
}

interface CollateralDepositsListProps {
  deposits: CollateralDeposit[]
}

export function CollateralDepositsList({ deposits }: CollateralDepositsListProps) {
  if (deposits.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No collateral deposits yet.</p>
  }

  return (
    <ul className="flex flex-col gap-3">
      {deposits.map((deposit) => (
        <li key={deposit.id} className="flex items-center gap-3">
          <AcmeLogo className="h-9 w-9 shrink-0 rounded-full text-sm" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              {format(parseISO(deposit.requested_at), 'MMM d, yyyy')}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground capitalize">
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_COLOR[deposit.status]}`} />
              {deposit.status}
            </p>
          </div>
          <span className="text-sm font-semibold text-foreground">{formatCents(deposit.amount_cents)}</span>
        </li>
      ))}
    </ul>
  )
}
