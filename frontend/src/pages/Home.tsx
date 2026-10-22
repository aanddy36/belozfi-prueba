import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageShell } from '@/common/components/PageShell'
import { Button } from '@/common/components/ui/button'
import { AccountGrid } from '@/features/accounts/components/AccountGrid'
import { CreateCardModal } from '@/features/accounts/components/CreateCardModal'
import { CreateCardPlaceholder, CreditCardView } from '@/features/accounts/components/CreditCardView'
import { getAccountMe } from '@/features/accounts/services/accountsService'
import { PayModal } from '@/features/payments/components/PayModal'
import { SimulatePurchaseButton } from '@/features/purchases/components/SimulatePurchaseButton'
import { SimulatePurchaseModal } from '@/features/purchases/components/SimulatePurchaseModal'
import { TransactionsList } from '@/features/transactions/components/TransactionsList'
import { listTransactions } from '@/features/transactions/services/transactionsService'

export function HomePage() {
  const [isCreateCardOpen, setCreateCardOpen] = useState(false)
  const [isPayOpen, setPayOpen] = useState(false)
  const [isPurchaseOpen, setPurchaseOpen] = useState(false)

  const {
    data: account,
    error,
    isLoading,
  } = useQuery({
    queryKey: ['account', 'me'],
    queryFn: getAccountMe,
    // Polling mientras el depósito de garantía sigue pending (confirmación lazy a los 10s, infra.md sección 1).
    refetchInterval: (query) => (query.state.data?.card.display_status === 'Pending' ? 1500 : false),
  })

  // El grid/Pay/movimientos se ven apenas la tarjeta se activó (Active o Frozen) — congelar
  // solo bloquea compras nuevas, no ver el estado de la cuenta ni pagar la deuda.
  const cardActivated = account?.card.status !== 'inactive'
  // "Simulate purchase" sí queda estrictamente para Active (no tiene sentido comprar frozen).
  const isActive = account?.card.display_status === 'Active'

  const { data: transactions } = useQuery({
    queryKey: ['transactions', 'home'],
    queryFn: () => listTransactions(1, 6),
    enabled: cardActivated,
  })

  return (
    <PageShell>
      <div className="flex flex-col items-center gap-6">
        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

        {!isLoading && !account && !error && (
          <CreateCardPlaceholder onClick={() => setCreateCardOpen(true)} />
        )}

        {!isLoading && error && (
          <p className="text-sm text-destructive">Couldn't load your account. Try again later.</p>
        )}

        {account && (
          <>
            <Link to="/card" className="group block w-full max-w-md">
              <CreditCardView
                displayStatus={account.card.display_status}
                currentDebtCents={account.current_debt_cents}
                interactive
              />
            </Link>

            {cardActivated && (
              <div className="w-full space-y-6">
                <AccountGrid
                  availableCreditCents={account.account.available_credit_cents}
                  creditLimitCents={account.account.credit_limit_cents}
                  statementDate={account.statement_date}
                  minimumPaymentCents={account.minimum_payment_cents}
                  paymentDueDate={account.payment_due_date}
                />

                <Button
                  onClick={() => setPayOpen(true)}
                  disabled={account.current_debt_cents === 0}
                  className="w-full"
                >
                  Pay
                </Button>

                <div className="border-t border-gray-200 pt-4">
                  <h2 className="text-center text-sm font-semibold text-foreground">Transactions</h2>
                  <div className="mt-3">
                    <TransactionsList items={transactions?.items ?? []} />
                  </div>
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

      <CreateCardModal open={isCreateCardOpen} onOpenChange={setCreateCardOpen} />

      {account && cardActivated && (
        <PayModal
          open={isPayOpen}
          onOpenChange={setPayOpen}
          minimumPaymentCents={account.minimum_payment_cents}
          currentDebtCents={account.current_debt_cents}
        />
      )}

      {account && isActive && (
        <>
          <SimulatePurchaseButton onClick={() => setPurchaseOpen(true)} />
          <SimulatePurchaseModal
            open={isPurchaseOpen}
            onOpenChange={setPurchaseOpen}
            availableCreditCents={account.account.available_credit_cents}
          />
        </>
      )}
    </PageShell>
  )
}
