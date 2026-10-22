# Spec 7 — Design

## Nota de alcance

Backend: nada nuevo — `GET /transactions?page=&page_size=` ya existe desde Spec 3. Frontend: reusa `listTransactions` (`features/transactions/services/transactionsService.ts`) y `TransactionsList` (`features/transactions/components/TransactionsList.tsx`), ambos del Spec 4 — esta spec es, en esencia, una página nueva que les agrega paginación real (la Home ya los usaba, pero fija en `page=1, page_size=6`, sin controles).

## `pages/Transactions.tsx`

```tsx
import { useQuery } from '@tanstack/react-query'
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
            >
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
```

(falta el `import { useState } from 'react'` en el snippet de arriba, se agrega al implementar)

## Paginación — por qué `page` en `useState` y no en la URL

`infra.md` pide "paginación básica", sin especificar si debe sobrevivir a un refresh de la página vía query param (`?page=2`). Se eligió `useState` local (más simple, menos superficie) en vez de `useSearchParams` — si el usuario refresca estando en la página 3, vuelve a la 1. Es una decisión de alcance menor, documentada acá para que quede explícita (no en `infra.md`).

## Router y Home

`router.tsx`: se reemplaza el catch-all de `/transactions` (que hasta ahora caía en la página "not built yet" genérica) por `<Route path="/transactions" element={<TransactionsPage />} />`, antes del catch-all `*`.

`Home.tsx`: el link "View all transactions" ya apuntaba a `/transactions` desde el Spec 4 — no necesita ningún cambio.

## Nota sobre invalidación de cache

Las mutaciones de Spec 5/6 (`createPurchase`, `createPayment`) invalidan `queryKey: ['transactions']` — React Query matchea por prefijo, así que eso alcanza tanto a `['transactions', 'home']` (Home) como a `['transactions', 'all', page]` (esta página), sin tocar nada. Si el usuario hace un pago estando en `/transactions`, la página actual se refresca sola.
