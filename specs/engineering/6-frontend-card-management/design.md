# Spec 6 — Design

## Nota de alcance

Backend: **no hace falta nada nuevo** — los 5 endpoints que usa esta página ya existen (`PATCH /cards/freeze`, `GET /cards/me/details`, `POST /collateral-deposits`, `GET /collateral-deposits`, `POST /accounts/close`), todos de Specs 2/3. Lo único de backend que se tocó para habilitar esta spec fue el fix de `find_account_by_user` (ver `worklog.md` de Spec 2, addendum) — ya aplicado antes de este documento.

Reusa del Spec 5 el patrón completo de modal con `react-hook-form`+`zod` (`z.string().refine(...)`, no `z.coerce`), `Idempotency-Key` por request, y loading states (inputs deshabilitados + spinner + toast).

Se agrega un componente `switch` de shadcn (`npx shadcn add switch`), no usado hasta ahora.

## 1. Tipos comunes nuevos

```typescript
// common/types/card.ts
export interface CardDetails {
  card_number: string
  cardholder_name: string
  exp_month: number
  exp_year: number
  cvc: string
}
```

```typescript
// common/types/collateral.ts
export interface CollateralDeposit {
  id: string
  amount_cents: number
  status: 'pending' | 'confirmed'
  requested_at: string
  confirmed_at: string | null
}
```

## 2. Services nuevos

```typescript
// features/cards/services/cardsService.ts
import { apiFetch } from '@/api/client'
import type { CardDetails } from '@/common/types/card'

export function freezeCard(frozen: boolean): Promise<{ status: string }> {
  return apiFetch('/cards/freeze', {
    method: 'PATCH',
    body: JSON.stringify({ frozen }),
  })
}

export function getCardDetails(): Promise<CardDetails> {
  return apiFetch<CardDetails>('/cards/me/details')
}
```

*(`freezeCard` no manda `Idempotency-Key` — el endpoint ya es idempotente por naturaleza, Spec 2.)*

```typescript
// features/collateral/services/collateralService.ts
import { apiFetch, generateIdempotencyKey } from '@/api/client'
import type { CollateralDeposit } from '@/common/types/collateral'

export function createCollateralDeposit(amountCents: number): Promise<{ id: string; amount_cents: number; status: string }> {
  return apiFetch('/collateral-deposits', {
    method: 'POST',
    headers: { 'Idempotency-Key': generateIdempotencyKey() },
    body: JSON.stringify({ amount_cents: amountCents }),
  })
}

export function listCollateralDeposits(): Promise<CollateralDeposit[]> {
  return apiFetch<CollateralDeposit[]>('/collateral-deposits')
}
```

```typescript
// features/accounts/services/accountsService.ts (agregado)
export function closeAccount(): Promise<{ id: string; status: string }> {
  return apiFetch('/accounts/close', {
    method: 'POST',
    headers: { 'Idempotency-Key': generateIdempotencyKey() },
  })
}
```

## 3. `CreditCardView` — soporte para la "cara de detalles"

Se agrega un prop opcional `details`. Cuando está presente, reemplaza logo/Mastercard/"Current debt" por número/titular/exp/cvc — "Credit" y la bolita de estado se mantienen siempre, sin importar `details`.

```tsx
// features/accounts/components/CreditCardView.tsx (diff)
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
}

export function CreditCardView({ displayStatus, currentDebtCents, details }: CreditCardViewProps) {
  return (
    <div className="relative aspect-[1.586/1] w-full max-w-md rounded-2xl bg-gradient-to-br from-primary to-violet-900 p-6 text-primary-foreground shadow-lg">
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
          {displayStatus === 'Active' && (
            <div className="absolute bottom-6 left-6">
              <p className="text-xs opacity-80">Current debt</p>
              <p className="text-lg font-semibold">{formatCents(currentDebtCents)}</p>
            </div>
          )}
        </>
      )}

      {/* "Credit" + bolita de estado: sin cambios, se mantienen siempre */}
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
  return raw.replace(/(.{4})/g, '$1 ').trim() // "5555333344443333" -> "5555 3333 4444 3333"
}
```

`CreateCardPlaceholder` no cambia.

## 4. Historias de Usuario

### HU-6.1 — Congelar/descongelar mi tarjeta (toggle "Freeze card")

**Reglas:** refleja `card.status === 'frozen'`; deshabilitado si `card.status === 'inactive'` (no tiene sentido congelar una tarjeta que ni se activó — el backend igual lo rechazaría con `409 CARD_NOT_ACTIVE`, esto es solo mejor UX).

```tsx
// features/cards/components/FreezeToggle.tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { Switch } from '@/common/components/ui/switch'
import { freezeCard } from '@/features/cards/services/cardsService'

interface FreezeToggleProps {
  frozen: boolean
  disabled?: boolean
}

export function FreezeToggle({ frozen, disabled }: FreezeToggleProps) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (next: boolean) => freezeCard(next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account', 'me'] })
      toast.success('Card updated')
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  })

  return (
    <label className="flex items-center justify-between rounded-lg border border-border p-3">
      <span className="text-sm font-medium">Freeze card</span>
      <Switch
        checked={frozen}
        disabled={disabled || mutation.isPending}
        onCheckedChange={(checked) => mutation.mutate(checked)}
      />
    </label>
  )
}
```

### HU-6.2 — Ver el detalle de mi tarjeta ("View details"/"Hide details")

**Reglas:** `GET /cards/me/details` se pide recién cuando se activa (no se precarga) — dato sensible, solo se pide si el usuario lo pide explícitamente. El botón es un toggle de estado local (`showDetails`), no hay nada que "cerrar" en el backend.

```tsx
// dentro de pages/Card.tsx
const [showDetails, setShowDetails] = useState(false)

const { data: details } = useQuery({
  queryKey: ['card', 'details'],
  queryFn: getCardDetails,
  enabled: showDetails,
})

// ...
<Button variant="outline" onClick={() => setShowDetails((prev) => !prev)}>
  {showDetails ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
  {showDetails ? 'Hide details' : 'View details'}
</Button>
```

El `details` que recibe `CreditCardView` es `showDetails && details ? {...mapeo...} : null` — si `showDetails` es `true` pero la query todavía no resolvió, se sigue viendo la cara normal hasta que llegue el dato (sin estado de carga dedicado, es casi instantáneo).

### HU-6.3 — Agregar garantía adicional (modal "Add collateral")

**Reglas:** mismo patrón exacto que `CreateCardModal` (Spec 5) — mínimo $1.000, `z.string().refine`, loading state completo — pero llama a `createCollateralDeposit` y apunta a la lista de depósitos, no a la cuenta.

```tsx
// features/collateral/components/AddCollateralModal.tsx
const schema = z.object({
  depositDollars: z.string().min(1, 'Required').refine((v) => Number(v) >= 1000, 'Minimum deposit is $1,000'),
})
type FormValues = z.infer<typeof schema>

export function AddCollateralModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const mutation = useMutation({
    mutationFn: (depositDollars: number) => createCollateralDeposit(dollarsToCents(depositDollars)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collateral-deposits'] })
      reset()
      onOpenChange(false)
      toast.success('Deposit received — confirming shortly')
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  })

  function onSubmit(values: FormValues) {
    mutation.mutate(Number(values.depositDollars))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add collateral</DialogTitle>
          <DialogDescription>Deposit more to increase your credit limit.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="collateral-deposit">Deposit amount</Label>
            <Input
              id="collateral-deposit"
              type="number"
              step="0.01"
              disabled={mutation.isPending}
              {...register('depositDollars')}
            />
            {errors.depositDollars && <p className="text-xs text-destructive">{errors.depositDollars.message}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending} className="w-full">
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              {mutation.isPending ? 'Creating...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

**Nota de polling**: a diferencia de `CreateCardModal` (cuya confirmación la hace *la Home*, vía `refetchInterval` sobre `['account','me']`), acá el polling vive en la query de la lista de depósitos de `/card` (ver sección 6) — porque es ahí donde el usuario va a ver el `pending → confirmed`.

### HU-6.4 — Cancelar mi tarjeta (modal "Cancel card")

**Reglas:** si `current_debt_cents > 0`, el botón de confirmar queda deshabilitado y se muestra el motivo — pero el backend (`409 OUTSTANDING_BALANCE`) sigue siendo la validación real (por si la deuda cambia entre que se abrió el modal y se confirma). Al confirmar con éxito, navega a `/home` (que va a mostrar la silueta de "Create card", porque la cuenta ahora es invisible para `GET /accounts/me` — ver Spec 2 addendum).

```tsx
// features/accounts/components/CancelCardModal.tsx
interface CancelCardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentDebtCents: number
}

export function CancelCardModal({ open, onOpenChange, currentDebtCents }: CancelCardModalProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const hasDebt = currentDebtCents > 0

  const mutation = useMutation({
    mutationFn: () => closeAccount(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account', 'me'] })
      onOpenChange(false)
      toast.success('Card cancelled — your collateral was released')
      navigate('/home')
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel card</DialogTitle>
          <DialogDescription>
            {hasDebt
              ? "You can't cancel your card while you have an outstanding balance."
              : 'This will close your account and release your collateral. This cannot be undone.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={hasDebt || mutation.isPending}
            className="w-full"
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            {mutation.isPending ? 'Cancelling...' : 'Confirm cancellation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### HU-6.5 — Ver mis depósitos de garantía (sección "Collateral deposited")

```tsx
// features/collateral/components/CollateralDepositsList.tsx
import { format, parseISO } from 'date-fns'
import { AcmeLogo } from '@/common/components/AcmeLogo'
import { formatCents } from '@/common/utils/money'
import type { CollateralDeposit } from '@/common/types/collateral'

export function CollateralDepositsList({ deposits }: { deposits: CollateralDeposit[] }) {
  if (deposits.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No collateral deposits yet.</p>
  }
  return (
    <ul className="flex flex-col gap-3">
      {deposits.map((d) => (
        <li key={d.id} className="flex items-center gap-3">
          <AcmeLogo className="h-9 w-9 shrink-0 rounded-full text-sm" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{format(parseISO(d.requested_at), 'MMM d, yyyy')}</p>
            <p className="text-xs text-muted-foreground capitalize">{d.status}</p>
          </div>
          <span className="text-sm font-semibold text-foreground">{formatCents(d.amount_cents)}</span>
        </li>
      ))}
    </ul>
  )
}
```

## 5. `pages/Card.tsx` — composición

```tsx
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
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
            <Button variant="outline" onClick={() => setCancelOpen(true)}>
              Cancel card
            </Button>
            <Button variant="outline" onClick={() => setAddCollateralOpen(true)}>
              Add collateral
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
```

`useQuery(['account','me'])` comparte cache con la Home (misma `queryKey`) — no hay doble fetch al navegar de una a otra, y el `refetchInterval` de "Pending" de la Home sigue aplicando acá también si hiciera falta (aunque en la práctica no se navega a `/card` mientras está `Pending`, porque el botón "+"/tarjeta clickeable recién se habilita después, ver sección 6).

## 6. Conectar desde la Home + router

`Home.tsx`: la tarjeta pasa a ser un link a `/card` (cuando hay cuenta, sin importar el estado — la página `/card` y el backend son los que determinan qué acciones están permitidas):

```tsx
{account && (
  <>
    <Link to="/card" className="w-full max-w-md">
      <CreditCardView displayStatus={account.card.display_status} currentDebtCents={account.current_debt_cents} />
    </Link>
    {/* ...resto sin cambios... */}
  </>
)}
```

`router.tsx`: se agrega `<Route path="/card" element={<CardPage />} />` (antes del catch-all `*`).

## 7. Nota para Spec 7

`CollateralDepositsList` y el patrón de `AddCollateralModal` no se reusan en Spec 7 (transactions es un listado distinto) — pero el patrón de paginación/polling de este spec (`refetchInterval` condicional sobre el estado de los datos) ya quedó establecido en 2 lugares (Home y acá), listo para reusarse si hiciera falta.
