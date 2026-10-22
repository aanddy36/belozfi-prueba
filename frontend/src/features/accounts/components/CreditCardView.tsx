import { Plus } from 'lucide-react'
import { AcmeLogo } from '@/common/components/AcmeLogo'
import { formatCents } from '@/common/utils/money'
import type { DisplayStatus } from '@/common/types/account'

const STATUS_DOT_COLOR: Record<DisplayStatus, string> = {
  Pending: 'bg-amber-400',
  Active: 'bg-emerald-500',
  Frozen: 'bg-sky-400',
  Cancelled: 'bg-gray-400',
  Overdue: 'bg-red-500',
}

interface CardFaceDetails {
  cardNumber: string
  cardholderName: string
  expMonth: number
  expYear: number
  cvc: string
}

interface CreditCardViewProps {
  displayStatus: DisplayStatus
  currentDebtCents: number
  details?: CardFaceDetails | null
  /** true cuando la tarjeta es clickeable (ej. en la Home, envuelta en un Link a /card). */
  interactive?: boolean
}

export function CreditCardView({ displayStatus, currentDebtCents, details, interactive }: CreditCardViewProps) {
  return (
    <div
      className={`relative aspect-[1.586/1] w-full max-w-md rounded-2xl bg-gradient-to-br from-primary to-violet-900 p-6 text-primary-foreground shadow-lg transition-all duration-200 ${
        interactive ? 'group-hover:-translate-y-1 group-hover:shadow-2xl' : ''
      }`}
    >
      {details ? (
        <>
          <div className="absolute top-6 left-6">
            <p className="text-lg font-semibold tracking-wider">{formatCardNumber(details.cardNumber)}</p>
            <p className="mt-1 text-sm opacity-90">{details.cardholderName}</p>
          </div>
          <div className="absolute bottom-6 left-6 text-sm opacity-90">
            Exp: {String(details.expMonth).padStart(2, '0')}/{String(details.expYear).slice(-2)}
          </div>
          <div className="absolute bottom-6 right-6 text-sm opacity-90">CVC: {details.cvc}</div>
        </>
      ) : (
        <>
          <div className="absolute top-6 left-6">
            <AcmeLogo variant="inverted" className="h-8 w-8 text-base" />
          </div>
          <div className="absolute bottom-6 right-6">
            <MastercardMark />
          </div>
          {displayStatus !== 'Pending' && (
            <div className="absolute bottom-6 left-6">
              <p className="text-xs opacity-80">Current debt</p>
              <p className="text-lg font-semibold">{formatCents(currentDebtCents)}</p>
            </div>
          )}
        </>
      )}

      <div className="absolute top-6 right-6 flex flex-col items-end gap-1.5">
        <span className="text-sm font-medium opacity-90">Credit</span>
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT_COLOR[displayStatus]}`} />
          <span className="text-xs opacity-90">{displayStatus}</span>
        </span>
      </div>
    </div>
  )
}

function formatCardNumber(raw: string): string {
  return raw.replace(/(.{4})/g, '$1 ').trim()
}

function MastercardMark() {
  return (
    <div className="flex" aria-label="Mastercard">
      <div className="h-6 w-6 rounded-full bg-red-500/90" />
      <div className="-ml-2.5 h-6 w-6 rounded-full bg-amber-400/90 mix-blend-screen" />
    </div>
  )
}

export function CreateCardPlaceholder({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex aspect-[1.586/1] w-full max-w-md cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-transparent transition-colors hover:border-gray-400 hover:bg-white"
    >
      <Plus className="size-6 text-gray-400 group-hover:text-gray-600" />
      <span className="text-sm font-medium text-gray-400 group-hover:text-gray-600">Create card</span>
    </button>
  )
}
