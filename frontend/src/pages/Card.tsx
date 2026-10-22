import { useQuery } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { PageShell } from '@/common/components/PageShell'
import { Button } from '@/common/components/ui/button'
import { CancelCardModal } from '@/features/accounts/components/CancelCardModal'
import { CreditCardView } from '@/features/accounts/components/CreditCardView'
import { getAccountMe } from '@/features/accounts/services/accountsService'
import { FreezeToggle } from '@/features/cards/components/FreezeToggle'
import { getCardDetails } from '@/features/cards/services/cardsService'
import { AddCollateralModal } from '@/features/collateral/components/AddCollateralModal'
import { CollateralDepositsList } from '@/features/collateral/components/CollateralDepositsList'
import { listCollateralDeposits } from '@/features/collateral/services/collateralService'

export function CardPage() {
  const [showDetails, setShowDetails] = useState(false)
  const [isAddCollateralOpen, setAddCollateralOpen] = useState(false)
  const [isCancelOpen, setCancelOpen] = useState(false)

  const { data: account, isLoading } = useQuery({ queryKey: ['account', 'me'], queryFn: getAccountMe })

  const { data: details } = useQuery({
    queryKey: ['card', 'details'],
    queryFn: getCardDetails,
    enabled: showDetails,
  })

  const { data: deposits } = useQuery({
    queryKey: ['collateral-deposits'],
    queryFn: listCollateralDeposits,
    refetchInterval: (query) => (query.state.data?.some((d) => d.status === 'pending') ? 1500 : false),
  })

  if (isLoading) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </PageShell>
    )
  }

  if (!account) {
    return <Navigate to="/home" replace />
  }

  return (
    <PageShell>
      <div className="flex flex-col items-center gap-6">
        <Link to="/home" className="self-start text-sm font-medium text-muted-foreground hover:text-foreground">
          ← Back to home
        </Link>

        <CreditCardView
          displayStatus={account.card.display_status}
          currentDebtCents={account.current_debt_cents}
          details={
            showDetails && details
              ? {
                  cardNumber: details.card_number,
                  cardholderName: details.cardholder_name,
                  expMonth: details.exp_month,
                  expYear: details.exp_year,
                  cvc: details.cvc,
                }
              : null
          }
        />

        <div className="w-full space-y-4">
          <FreezeToggle frozen={account.card.status === 'frozen'} disabled={account.card.status === 'inactive'} />

          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" onClick={() => setShowDetails((prev) => !prev)}>
              {showDetails ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {showDetails ? 'Hide details' : 'View details'}
            </Button>
            <Button variant="outline" onClick={() => setAddCollateralOpen(true)}>
              Add collateral
            </Button>
            <Button variant="outline" onClick={() => setCancelOpen(true)}>
              Cancel card
            </Button>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <h2 className="text-center text-sm font-semibold text-foreground">Collateral deposited</h2>
            <div className="mt-3">
              <CollateralDepositsList deposits={deposits ?? []} />
            </div>
          </div>
        </div>
      </div>

      <AddCollateralModal open={isAddCollateralOpen} onOpenChange={setAddCollateralOpen} />
      <CancelCardModal open={isCancelOpen} onOpenChange={setCancelOpen} currentDebtCents={account.current_debt_cents} />
    </PageShell>
  )
}
