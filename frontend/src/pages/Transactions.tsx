import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageShell } from '@/common/components/PageShell'
import { Button } from '@/common/components/ui/button'
import { TransactionsList } from '@/features/transactions/components/TransactionsList'
import { listTransactions } from '@/features/transactions/services/transactionsService'

const PAGE_SIZE = 20

export function TransactionsPage() {
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', 'all', page],
    queryFn: () => listTransactions(page, PAGE_SIZE),
  })

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <PageShell>
      <div className="flex flex-col items-center gap-6">
        <Link to="/home" className="self-start text-sm font-medium text-muted-foreground hover:text-foreground">
          ← Back to home
        </Link>

        <div className="w-full">
          <h1 className="mb-4 text-center text-lg font-semibold text-foreground">Transactions</h1>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <TransactionsList items={data?.items ?? []} />
          )}

          <div className="mt-6 flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
