import { format, parseISO } from 'date-fns'
import { AcmeLogo } from '@/common/components/AcmeLogo'
import { formatCents } from '@/common/utils/money'
import type { TransactionItem } from '@/common/types/transaction'

interface TransactionsListProps {
  items: TransactionItem[]
}

export function TransactionsList({ items }: TransactionsListProps) {
  if (items.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No transactions yet.</p>
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((item, index) => (
        <TransactionRow key={index} item={item} />
      ))}
    </ul>
  )
}

function TransactionRow({ item }: { item: TransactionItem }) {
  const isPurchase = item.type === 'purchase'
  const title = isPurchase ? (item.merchant_name ?? 'Purchase') : 'Payment'

  return (
    <li className="flex items-center gap-3 py-3">
      <AcmeLogo className="h-9 w-9 shrink-0 rounded-full text-sm" />
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{format(parseISO(item.date), 'MMM d, yyyy')}</p>
      </div>
      <span className={`text-sm font-semibold ${isPurchase ? 'text-foreground' : 'text-emerald-600'}`}>
        {formatCents(item.amount_cents)}
      </span>
    </li>
  )
}
