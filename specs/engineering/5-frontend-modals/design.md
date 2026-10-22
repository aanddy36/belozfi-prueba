# Spec 5 — Design

Documento escrito en base a lo ya implementado (mismo criterio que Spec 4 — ver nota ahí). Reusa `api/client.ts`, `PageShell`, `AcmeLogo` y los tipos comunes del Spec 4; agrega los componentes `dialog`/`radio-group`/`select` de shadcn (sin tocar `button.tsx`, que ya tenía el fix de `cursor-pointer` del Spec 4).

## 1. Helper común: dólares → centavos

Los 3 modales piden montos en dólares (lo que el usuario entiende), pero la API espera centavos. Se agregó a `common/utils/money.ts`:

```typescript
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100)
}
```

## 2. Services con `Idempotency-Key`

Los 3 endpoints de mutación (`POST /accounts`, `POST /payments`, `POST /purchases`) generan una key nueva por intento con `generateIdempotencyKey()` (ya existía en `api/client.ts` desde el Spec 4, sin uso hasta ahora):

```typescript
// features/accounts/services/accountsService.ts (agregado)
export function createAccount(depositAmountCents: number): Promise<{ id: string; status: string }> {
  return apiFetch('/accounts', {
    method: 'POST',
    headers: { 'Idempotency-Key': generateIdempotencyKey() },
    body: JSON.stringify({ deposit_amount_cents: depositAmountCents }),
  })
}
```

```typescript
// features/payments/services/paymentsService.ts (nuevo)
export function createPayment(amountCents: number): Promise<{ id: string; amount_cents: number }> {
  return apiFetch('/payments', {
    method: 'POST',
    headers: { 'Idempotency-Key': generateIdempotencyKey() },
    body: JSON.stringify({ amount_cents: amountCents }),
  })
}
```

```typescript
// features/purchases/services/purchasesService.ts (nuevo)
export type InstallmentPlan = 1 | 3 | 6 | 12

export function createPurchase(
  merchantName: string,
  amountCents: number,
  installmentPlan: InstallmentPlan
): Promise<{ id: string; merchant_name: string; amount_cents: number; installment_plan: InstallmentPlan; status: string }> {
  return apiFetch('/purchases', {
    method: 'POST',
    headers: { 'Idempotency-Key': generateIdempotencyKey() },
    body: JSON.stringify({
      merchant_name: merchantName,
      amount_cents: amountCents,
      installment_plan: installmentPlan,
    }),
  })
}
```

## 3. Historias de Usuario

### HU-5.1 — Crear tarjeta garantizada (modal "Create card")

**Como** cliente sin cuenta, **quiero** depositar una garantía inicial **para** que se cree mi cuenta y tarjeta.

**Reglas:** mínimo $1.000 validado en frontend (`zod`, sin llamar al backend si falla) y en backend (Spec 2, por si se lo saltea). Al confirmar, invalida `['account','me']` y cierra el modal — la Home hace el resto (ver 4.2, polling).

**Nota de tipado**: se evitó `z.coerce.number()` de Zod 4 — genera un desacople de tipos input/output que rompe la inferencia de `useForm`/`handleSubmit` de `react-hook-form` (el campo registrado queda tipado `unknown`). Se usó `z.string().refine(...)` en su lugar (el campo vive como string en el form, se convierte a `Number(...)` recién al llamar a la mutación) — más simple y sin esa fricción de tipos.

```tsx
const schema = z.object({
  depositDollars: z
    .string()
    .min(1, 'Required')
    .refine((v) => Number(v) >= 1000, 'Minimum deposit is $1,000'),
})
type FormValues = z.infer<typeof schema>

export function CreateCardModal({ open, onOpenChange }: CreateCardModalProps) {
  const queryClient = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const mutation = useMutation({
    mutationFn: (depositDollars: number) => createAccount(dollarsToCents(depositDollars)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account', 'me'] })
      reset()
      onOpenChange(false)
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
          <DialogTitle>Create your guaranteed card</DialogTitle>
          <DialogDescription>Deposit a collateral amount to get started.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="deposit">Deposit amount</Label>
            <Input id="deposit" type="number" step="0.01" min={1000} {...register('depositDollars')} />
            {errors.depositDollars && <p className="text-xs text-destructive">{errors.depositDollars.message}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending} className="w-full">
              {mutation.isPending ? 'Creating...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

### HU-5.2 — Pagar mi deuda (modal "Pay")

**Como** cliente activo, **quiero** elegir entre pago mínimo, total u otro monto **para** reducir mi deuda.

**Reglas:** 3 `RadioGroupItem` (minimum/full/other); el input de "Other amount" solo aparece con esa opción seleccionada. Validación manual (no `zod`, porque el piso depende de `currentDebtCents`, un prop dinámico): `amountCents >= min(2500, currentDebtCents)` y `amountCents <= currentDebtCents`. El estado local se resetea cada vez que el modal se abre (`useEffect` sobre `open`).

```tsx
const floorCents = Math.min(2500, currentDebtCents)

function handleConfirm() {
  setError(null)
  if (option === 'minimum') { mutation.mutate(minimumPaymentCents); return }
  if (option === 'full') { mutation.mutate(currentDebtCents); return }

  const dollars = Number(otherAmount)
  if (!otherAmount || Number.isNaN(dollars) || dollars <= 0) { setError('Enter an amount'); return }
  const amountCents = dollarsToCents(dollars)
  if (amountCents < floorCents) { setError(`Minimum payment is ${formatCents(floorCents)}`); return }
  if (amountCents > currentDebtCents) { setError('Amount exceeds your current debt'); return }
  mutation.mutate(amountCents)
}
```

Al confirmar, invalida `['account','me']` **y** `['transactions']` (el pago aparece en la lista de movimientos sin refresh).

### HU-5.3 — Simular una compra (botón "+" + modal)

**Como** cliente activo, **quiero** simular un gasto en 1/3/6/12 cuotas **para** probar la autorización contra mi cupo.

**Botón flotante** (`features/purchases/components/SimulatePurchaseButton.tsx`), fijo a la derecha de la pantalla (no de la columna central — "a la derecha de la pantalla" en `infra.md` es literal, el botón queda `fixed` relativo al viewport):

```tsx
export function SimulatePurchaseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Simulate purchase"
      className="fixed top-1/2 right-6 flex size-12 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
    >
      <Plus className="size-6" />
    </button>
  )
}
```

**Modal**: `merchantName` (texto libre), `amountDollars` (mismo patrón `z.string().refine` que HU-5.1), `installmentPlan` (`Select` de shadcn con `Controller`, ya que no es un input nativo registrable directo). La validación de cupo (`amountCents > availableCreditCents`) se hace a mano en `onSubmit`, seteando el error directo en el campo vía `setError('amountDollars', ...)` de `react-hook-form` en vez de bloquear antes del submit — así el usuario ve el mensaje en el lugar donde ya espera ver errores de ese campo.

```tsx
function onSubmit(values: FormValues) {
  if (dollarsToCents(Number(values.amountDollars)) > availableCreditCents) {
    setError('amountDollars', { message: 'Amount exceeds your available limit' })
    return
  }
  mutation.mutate(values)
}
```

Visible solo si `account.card.display_status === 'Active'` — se renderiza condicionalmente en `Home.tsx`, junto con `PayModal`.

## 4. Integración en `Home.tsx`

### 4.1 Conectar el modal a la silueta

`CreateCardPlaceholder` (Spec 4) ya aceptaba un `onClick?`, pero no se lo pasaba nadie. Ahora:

```tsx
const [isCreateCardOpen, setCreateCardOpen] = useState(false)
// ...
{!isLoading && !account && !error && (
  <CreateCardPlaceholder onClick={() => setCreateCardOpen(true)} />
)}
// ...
<CreateCardModal open={isCreateCardOpen} onOpenChange={setCreateCardOpen} />
```

*(Nota revisada tras probar en el navegador: originalmente esto chequeaba `error instanceof ApiError && error.status === 404`, porque `GET /accounts/me` devolvía `404` sin cuenta. Se discutió con el usuario que eso trataba un estado de negocio normal como un error — se cambió el backend (Spec 2) a `200` con `data: null`, y acá simplemente se chequea `!account`. Ver el addendum en el `worklog.md` de Spec 2.)*

### 4.2 Polling mientras la cuenta está `Pending`

`infra.md` pide polling de 1-2s a `GET /accounts/me` después de crear el depósito, hasta que confirme (10s, lazy). Se implementó con `refetchInterval` de React Query como función del estado actual de la query (no un valor fijo) — así el polling se apaga solo en cuanto deja de ser necesario, sin un `useEffect` aparte:

```tsx
const { data: account, error, isLoading } = useQuery({
  queryKey: ['account', 'me'],
  queryFn: getAccountMe,
  refetchInterval: (query) => (query.state.data?.card.display_status === 'Pending' ? 1500 : false),
})
```

### 4.3 Botón "Pay" y botón "+"

El botón "Pay" (color `primary`, ancho completo) se agregó entre el grid y la lista de movimientos, tal como lo ubica `infra.md`. El botón "+" y los 2 modales de acción (`PayModal`, `SimulatePurchaseModal`) se renderizan solo cuando `account && isActive`, al margen del flujo principal de la página (son overlays):

```tsx
{isActive && (
  <div className="w-full space-y-6">
    <AccountGrid ... />
    <Button onClick={() => setPayOpen(true)} className="w-full">Pay</Button>
    <div>
      <TransactionsList items={transactions?.items ?? []} />
      <Link to="/transactions">View all transactions</Link>
    </div>
  </div>
)}

<CreateCardModal open={isCreateCardOpen} onOpenChange={setCreateCardOpen} />

{account && isActive && (
  <>
    <SimulatePurchaseButton onClick={() => setPurchaseOpen(true)} />
    <PayModal open={isPayOpen} onOpenChange={setPayOpen} minimumPaymentCents={...} currentDebtCents={...} />
    <SimulatePurchaseModal open={isPurchaseOpen} onOpenChange={setPurchaseOpen} availableCreditCents={...} />
  </>
)}
```

## 5. Nota para Spec 6

El modal "Add collateral" de la página `/card` reusa el mismo patrón que HU-5.1 (mismo mínimo $1.000, mismo `z.string().refine`, mismo service a crear — `createCollateralDeposit` en un nuevo `features/collateral/services/collateralService.ts`), solo que apunta a `POST /collateral-deposits` en vez de `POST /accounts`.
