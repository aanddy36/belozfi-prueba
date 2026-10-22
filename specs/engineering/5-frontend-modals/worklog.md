# Spec 5 — Worklog

## Estado: completo. El usuario probó el flujo completo de punta a punta en el navegador real (Create card → polling → Active → Pay → Simulate purchase) y confirmó que todo funciona.

## Hecho

### shadcn
- Se agregaron `dialog.tsx`, `radio-group.tsx`, `select.tsx` (vía `shadcn add`). `button.tsx` se mantuvo igual (el CLI preguntó si sobreescribirlo por el `cursor-pointer` del Spec 4; se respondió que no).

### Helper
- `common/utils/money.ts`: se agregó `dollarsToCents(dollars)`.

### Services nuevos/ampliados (los 3 con `Idempotency-Key` generada por request)
- `features/accounts/services/accountsService.ts`: se agregó `createAccount(depositAmountCents)`.
- `features/payments/services/paymentsService.ts` (nuevo): `createPayment(amountCents)`.
- `features/purchases/services/purchasesService.ts` (nuevo): `createPurchase(merchantName, amountCents, installmentPlan)`.

### Componentes nuevos
- `features/accounts/components/CreateCardModal.tsx` — modal "Create card".
- `features/payments/components/PayModal.tsx` — modal "Pay" (3 radio buttons, input condicional).
- `features/purchases/components/SimulatePurchaseModal.tsx` — modal "Simulate purchase" (merchant/monto/cuotas).
- `features/purchases/components/SimulatePurchaseButton.tsx` — botón "+" fijo.

### `pages/Home.tsx`
- Se conectó `CreateCardPlaceholder.onClick` al nuevo modal.
- Se agregó `refetchInterval` a la query de la cuenta (polling de 1.5s mientras `display_status === 'Pending'`).
- Se agregó el botón "Pay" (entre el grid y la lista de movimientos) y el botón "+" + sus 2 modales, todos condicionados a `isActive`.

## Probado

- `npm run build` (TypeScript + Vite) pasa limpio.
- Se encontró y corrigió un problema de tipos real: `z.coerce.number()` de Zod 4 rompe la inferencia de `useForm`/`handleSubmit` de `react-hook-form` (el tipo de salida del coerce no coincide con el de entrada que espera el form) — se cambió a `z.string().refine(...)` en los 2 modales que lo usaban (`CreateCardModal`, `SimulatePurchaseModal`), documentado en `design.md`.
- Dev server (`localhost:5173`) y backend (`localhost:8000`) corriendo sin errores en el log de Vite después de cada cambio.
- Se confirmó contra el backend real que no existe ninguna cuenta (`GET /accounts/me` → `404` en ese momento, luego revisado a `200`/`data: null`, ver más abajo), dejando el ambiente listo para que el usuario pruebe el flujo completo de punta a punta él mismo (crear tarjeta → esperar 10s → Pay / Simulate purchase).

## Ajustes de UX pedidos tras la primera revisión visual

- **Validación nativa del navegador en vez del mensaje propio**: el input de depósito tenía `min={1000}`, un atributo HTML nativo — el navegador mostraba su propio tooltip de validación *antes* de que corriera el resolver de `zod`, pisando el mensaje de error en rojo que ya existía debajo del campo. Se sacó el `min` y se agregó `noValidate` a los 3 `<form>` de la app (Login, Create card, Simulate purchase) para que la única validación visible sea la nuestra.
- **Modal chico y con el título poco diferenciado**: se agrandó `DialogContent` (`sm:max-w-sm` → `sm:max-w-lg`, `p-4` → `p-6`, `gap-4` → `gap-5`) y `DialogTitle` (`text-base font-medium` → `text-xl font-bold`) en el componente compartido `common/components/ui/dialog.tsx` — afecta a los 3 modales a la vez. Se aumentó también el espacio entre cada `Label` y su `Input` (`space-y-1.5` → `space-y-2`) y entre campos del form (`space-y-4` → `space-y-5`).

## Bug real encontrado en el navegador: `Content-Type` perdido en `apiFetch`

El usuario probó `POST /accounts` desde la UI real y el backend devolvió `422 VALIDATION_ERROR` ("Input should be a valid dictionary or object to extract fields from") — compartió el `curl` exacto capturado del navegador, que mostraba `Content-Type: text/plain;charset=UTF-8` en vez de `application/json`.

**Causa**: en `api/client.ts` (Spec 4), `apiFetch` armaba las opciones de `fetch` así:
```ts
fetch(url, {
  headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  ...options,
})
```
Como los services pasan `options` con su propio `headers` (ej. `{ 'Idempotency-Key': ... }`), el spread de `...options` **después** pisaba por completo la key `headers` ya armada — el objeto final se quedaba solo con `Idempotency-Key`, sin `Content-Type`. El navegador, al mandar un `body` string sin `Content-Type` explícito, default a `text/plain;charset=UTF-8` (comportamiento documentado del Fetch API) — y con ese Content-Type, FastAPI no interpreta el body como JSON.

Esto afectaba a **todo** `POST`/`PATCH` con body de toda la app (no solo Spec 5) — recién se manifestó acá porque es el primer flujo con un `POST` real probado desde el navegador.

**Fix**: invertir el orden del spread (`...options` primero, `headers` después) para que el merge de headers gane:
```ts
fetch(url, {
  ...options,
  headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
})
```

**Verificado**: se reprodujo el mismo request (mismo body, con `Content-Type: application/json`) directo contra el backend — `200`, cuenta creada correctamente. Se borró esa cuenta de prueba de la DB local para no bloquear el flujo real del usuario.

## Decisión revisada: `GET /accounts/me` sin cuenta deja de ser `404`

Al chequear `GET /accounts/me` a mano, el usuario cuestionó el diseño: ¿por qué un `404` si "no tener cuenta" es el estado normal de cualquier cliente nuevo? Se coincidió en que forzaba al frontend a usar manejo de excepciones (`error instanceof ApiError && error.status === 404`) para un caso que no es un error. Se cambió el backend (Spec 2) a `200` con `data: null`, y se simplificó `Home.tsx`:

```tsx
// antes
retry: (failureCount, err) => (err instanceof ApiError && err.status === 404 ? false : failureCount < 2),
// ...
{accountNotFound && <CreateCardPlaceholder onClick={...} />}

// ahora
// (sin retry especial — ya no hay un 404 que tratar distinto)
{!isLoading && !account && !error && <CreateCardPlaceholder onClick={...} />}
```

`getAccountMe()` pasó a tipar `Promise<AccountMe | null>`. El resto de los endpoints de Accounts/Cards que sí necesitan que la cuenta exista para operar mantienen `404 ACCOUNT_NOT_FOUND` sin cambios (detalle completo en el `worklog.md`/`requirements.md` de Spec 2).

Se encontró de paso un incidente de compatibilidad al aplicar el fix en el backend: el venv local corre Python 3.9, y la sintaxis `dict | None` (PEP 604) no es válida en runtime antes de 3.10 — se usó `Optional[dict]` en su lugar. Verificado contra el backend real: `GET /accounts/me` sin cuenta → `{"statusCode":200,"message":"No account yet","data":null}`.

## Ronda final de ajustes de UX (tras probar el flujo completo en el navegador)

- **Home**: se sacó el texto "Color palette inspired by Nu". Se agregó una línea separatoria gris + título "Transactions" centrado entre el botón "Pay" y la lista de movimientos.
- **`TransactionsList`**: se sacó la línea separatoria entre cada ítem (`divide-y divide-border` → solo `gap-3`); se sacó el color verde de los pagos — ahora todos los montos usan el mismo color (`text-foreground`), sin diferenciar por tipo.
- **Estados de carga en los 3 modales**: antes solo se deshabilitaba el botón de submit; ahora se deshabilitan *todos* los campos del form mientras `mutation.isPending`, el botón muestra un ícono `Loader2` (spinner) + texto ("Creating..."/"Processing..."), y se agregó `toast.success(...)` en el `onSuccess` de las 3 mutaciones (antes solo había `toast.error` en el error) — para que quede feedback visible aunque el request sea rápido.
- **Toasts**: `<Toaster position="top-center" richColors />` en `App.tsx` — todos los toasts (de toda la app, incluido `/test-connection` del Spec 0) quedan centrados arriba, verdes en éxito y rojos en error.

## Incidente de HMR durante una edición en vivo (no un bug de producto)

Mientras se aplicaba el cambio del `404`→`200` (ver sección de arriba), Vite aplicó un hot-update a medias sobre `Home.tsx` entre dos ediciones consecutivas, dejando momentáneamente una referencia a una variable ya eliminada (`accountNotFound`) — la página crasheó en el navegador del usuario (`ReferenceError`, sin error boundary). Se corrigió solo con el siguiente guardado, pero quedó como aprendizaje: una tanda de ediciones en vivo sobre un archivo que está montado en un navegador real puede dejarlo en un estado roto hasta el siguiente refresh — se restartió el dev server de cero y se le pidió al usuario un hard refresh antes de seguir probando.

## Aclaración de negocio (no un bug): deuda de una compra en cuotas

El usuario preguntó por qué una compra de $300 a 3 cuotas aparecía como $300 de deuda inmediata, en vez de "dividida" en 3. Se confirmó que es el comportamiento correcto: `installment_plan` solo determina la tasa de interés (Spec 3), no fracciona la deuda — el monto completo se descuenta del cupo y pasa a ser deuda apenas se autoriza la compra, igual que una tarjeta de crédito real. No hay desglose cuota-por-cuota en este MVP (decisión de alcance ya tomada en el Spec 2, tabla `installments` descartada).

## No probado

- Ninguno — el usuario confirmó el flujo completo funcionando ("esta funcionando todo bien") tras la ronda final de ajustes. Los 7 criterios de aceptación de `requirements.md` quedan marcados como cumplidos.

## Desvíos / decisiones no explícitas en `infra.md`

- **Formato de inputs de monto**: los 3 modales piden el monto en dólares (ej. "1000"), no en centavos — más natural para el usuario, se convierte a centavos recién al llamar al service (`dollarsToCents`). `infra.md` no especifica esto, pero es la lectura obvia dado que toda la UI muestra montos en dólares.
- **Piso de "Other amount" en Pay**: se usa `min(2500, currentDebtCents)` — el piso real de $25 (`infra.md`/`product.md`), no el `minimum_payment_cents` del 5% (que es solo una opción sugerida, no el piso real de validación — ya se había aclarado esta distinción en el Spec 3 backend).
