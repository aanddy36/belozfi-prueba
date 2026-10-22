import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { PageShell } from '@/common/components/PageShell'
import { AccountGrid } from '@/features/accounts/components/AccountGrid'
import { CreateCardPlaceholder, CreditCardView } from '@/features/accounts/components/CreditCardView'
import { getAccountMe } from '@/features/accounts/services/accountsService'
import { TransactionsList } from '@/features/transactions/components/TransactionsList'
import { listTransactions } from '@/features/transactions/services/transactionsService'

export function HomePage() {
  const {
    data: account,
    error,
    isLoading,
  } = useQuery({
    queryKey: ['account', 'me'],
    queryFn: getAccountMe,
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.status === 404) return false
      return failureCount < 2
    },
  })

  const accountNotFound = error instanceof ApiError && error.status === 404
  const isActive = account?.card.display_status === 'Active'

  const { data: transactions } = useQuery({
    queryKey: ['transactions', 'home'],
    queryFn: () => listTransactions(1, 6),
    enabled: isActive,
  })

  return (
    <PageShell>
      <div className="flex flex-col items-center gap-6">
        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

        {accountNotFound && <CreateCardPlaceholder />}

        {!isLoading && error && !accountNotFound && (
          <p className="text-sm text-destructive">Couldn't load your account. Try again later.</p>
        )}

        {account && (
          <>
            <CreditCardView
              displayStatus={account.card.display_status}
              currentDebtCents={account.current_debt_cents}
            />
            <p className="text-xs text-muted-foreground">Color palette inspired by Nu</p>

            {isActive && (
              <div className="w-full space-y-6">
                <AccountGrid
                  availableCreditCents={account.account.available_credit_cents}
                  creditLimitCents={account.account.credit_limit_cents}
                  statementDate={account.statement_date}
                  minimumPaymentCents={account.minimum_payment_cents}
                  paymentDueDate={account.payment_due_date}
                />

                <div>
                  <TransactionsList items={transactions?.items ?? []} />
                  <Link
                    to="/transactions"
                    className="mt-2 block text-center text-sm font-medium text-primary hover:underline"
                  >
                    View all transactions
                  </Link>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PageShell>
  )
}
