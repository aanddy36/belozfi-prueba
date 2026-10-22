# Spec 4 — Design

Documento escrito en base a lo ya implementado (ver `worklog.md`) — no hubo una ronda previa de diseño antes de codear, como sí hubo en los Specs 1-3; este archivo deja constancia de las decisiones y el código final para que sirva de referencia a los Specs 5-7.

## 1. Fix de infraestructura: alias `@/*` en el `tsconfig.json` raíz

El `tsconfig.json` raíz (estilo "solution", solo con `references` a `tsconfig.app.json`/`tsconfig.node.json`) no tenía `compilerOptions.paths`. Herramientas que leen el tsconfig raíz directamente (como el CLI de `shadcn`) no resuelven el alias y generan archivos en una carpeta literal `@/` en vez de `src/`. Se agregó:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

## 2. `api/client.ts` — envelope estándar del backend

Reescrito para `{statusCode, message, data}` / `{statusCode, message, error}` (Spec 2). `apiFetch` devuelve `data` directo (puede ser `null` en una respuesta `200` legítima, ej. `GET /accounts/me` sin cuenta); en error lanza `ApiError` (con `status`/`code`).

*(Nota: este código quedó desactualizado tras la revisión del Spec 2 posterior al Spec 5 — originalmente `apiFetch` tenía un bug de orden de spread que perdía el `Content-Type`, corregido en Spec 5. El snippet de abajo ya refleja la versión final.)*

```typescript
const API_URL = import.meta.env.VITE_API_URL

export class ApiError extends Error {
  status: number
  code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

type ApiEnvelope<T> =
  | { statusCode: number; message: string; data: T }
  | { statusCode: number; message: string; error: { code: string; details?: unknown } }

export function generateIdempotencyKey(): string {
  return crypto.randomUUID()
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  })
  const body = (await res.json()) as ApiEnvelope<T>

  if (!res.ok || 'error' in body) {
    const code = 'error' in body ? body.error.code : undefined
    throw new ApiError(body.statusCode, body.message, code)
  }

  return body.data
}
```

`GET /health` (Spec 0) queda **fuera** de este cliente a propósito — no sigue el envelope. `TestConnectionPage` le pega con `fetch` nativo.

## 3. Paleta y marca

`index.css`: `--primary`/`--ring` cambiados a un morado (`oklch(0.541 0.241 293)` en light, `oklch(0.72 0.19 293)` en dark) — estilo Nu, con el disclaimer "Color palette inspired by Nu" visible debajo de la tarjeta en la Home.

`common/components/AcmeLogo.tsx` — el logo de toda la app (una "A" en badge), con variante `inverted` para usar sobre fondos oscuros (la tarjeta):

```tsx
import { cn } from '@/common/utils/utils'

interface AcmeLogoProps {
  className?: string
  variant?: 'default' | 'inverted'
}

export function AcmeLogo({ className, variant = 'default' }: AcmeLogoProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-xl font-bold',
        variant === 'inverted' ? 'bg-white/15 text-white' : 'bg-primary/10 text-primary',
        className
      )}
    >
      A
    </div>
  )
}
```

## 4. `PageShell` — layout compartido por todas las páginas

Fondo morado de borde a borde, columna central blanca `max-w-md` de arriba a abajo (`min-h-screen`), con un header opcional (logo → `/home`, "Log out" → `/`) que las páginas fuera de sesión (Login, Test connection) ocultan con `showHeader={false}`.

```tsx
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AcmeLogo } from '@/common/components/AcmeLogo'

interface PageShellProps {
  children: ReactNode
  showHeader?: boolean
}

export function PageShell({ children, showHeader = true }: PageShellProps) {
  return (
    <div className="min-h-screen w-full bg-violet-50">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-white">
        {showHeader && (
          <header className="flex items-center justify-between border-b border-border px-6 py-4">
            <Link to="/home" aria-label="Go to home">
              <AcmeLogo className="h-8 w-8 text-sm" />
            </Link>
            <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Log out
            </Link>
          </header>
        )}
        <div className="flex flex-1 flex-col px-6 py-10">{children}</div>
      </div>
    </div>
  )
}
```

## 5. Tipos y utilidades comunes

`common/types/account.ts`:
```typescript
export type AccountStatus = 'pending_collateral' | 'active' | 'frozen' | 'mora' | 'closed'
export type CardStatus = 'inactive' | 'active' | 'frozen'
export type DisplayStatus = 'Pending' | 'Active' | 'Frozen' | 'Cancelled' | 'Overdue'

export interface AccountSummary {
  status: AccountStatus
  credit_limit_cents: number
  available_credit_cents: number
  collateral_cents: number
}

export interface CardSummary {
  status: CardStatus
  display_status: DisplayStatus
}

export interface AccountMe {
  account: AccountSummary
  card: CardSummary
  current_debt_cents: number
  statement_date: string
  payment_due_date: string
  minimum_payment_cents: number
}
```

`common/types/transaction.ts`:
```typescript
export interface TransactionItem {
  type: 'purchase' | 'payment'
  merchant_name: string | null
  amount_cents: number
  date: string
}

export interface TransactionsPage {
  items: TransactionItem[]
  total: number
}
```

`common/utils/money.ts` — `formatCents` produce el formato de toda la app (`$ -445,983.17`):
```typescript
export function formatCents(amountCents: number): string {
  const amount = amountCents / 100
  const sign = amount < 0 ? '-' : ''
  const formatted = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `$ ${sign}${formatted}`
}
```

## 6. Módulo Accounts (frontend)

`features/accounts/services/accountsService.ts` — `getAccountMe()`.

`features/accounts/components/CreditCardView.tsx` — la tarjeta (5 estados visuales vía `display_status`, logo, marca de Mastercard con 2 círculos, "Current debt" solo si `Active`) y `CreateCardPlaceholder` (silueta punteada con ícono `+`, sin `onClick` en este spec — se conecta recién en Spec 5):

```tsx
const STATUS_DOT_COLOR: Record<DisplayStatus, string> = {
  Pending: 'bg-amber-400',
  Active: 'bg-emerald-500',
  Frozen: 'bg-sky-400',
  Cancelled: 'bg-gray-400',
  Overdue: 'bg-red-500',
}

export function CreditCardView({ displayStatus, currentDebtCents }: CreditCardViewProps) {
  return (
    <div className="relative aspect-[1.586/1] w-full max-w-md rounded-2xl bg-gradient-to-br from-primary to-violet-900 p-6 text-primary-foreground shadow-lg">
      <div className="absolute top-6 left-6">
        <AcmeLogo variant="inverted" className="h-8 w-8 text-base" />
      </div>
      <div className="absolute top-6 right-6 flex flex-col items-end gap-1.5">
        <span className="text-sm font-medium opacity-90">Credit</span>
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT_COLOR[displayStatus]}`} />
          <span className="text-xs opacity-90">{displayStatus}</span>
        </span>
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
    </div>
  )
}
```

`features/accounts/components/AccountGrid.tsx` — grid 2x2 (`Available limit` con el total como texto secundario / `Statement date`, `Minimum payment` / `Payment due date`), fechas formateadas con `date-fns`.

## 7. Módulo Transactions (frontend)

`features/transactions/services/transactionsService.ts` — `listTransactions(page, pageSize)`.

`features/transactions/components/TransactionsList.tsx` — lista reusable (ícono = `AcmeLogo`, nombre+fecha, monto con signo y color — verde para pagos, el color de texto normal para compras).

## 8. Páginas

`pages/Login.tsx` — `react-hook-form` + `zod`, `defaultValues` precargados (`john.doe` / `TempPass123!`), `onSubmit` navega a `/home` sin llamar a ningún endpoint (no hay auth real).

`pages/Home.tsx` — `useQuery(['account','me'])`; `data: null` (sin cuenta) → `CreateCardPlaceholder`; cuenta existente → `CreditCardView` + (si `Active`) `AccountGrid` + primeros 6 `TransactionsList` + "View all transactions" (→ `/transactions`, todavía no construida — Spec 7).

## 9. Router

`router.tsx`: `/` (Login), `/home` (Home), `/test-connection` (preservada del Spec 0), `*` (página "not built yet" con el mismo `PageShell`, para que cualquier ruta de un spec futuro no deje una pantalla en blanco mientras no exista).
