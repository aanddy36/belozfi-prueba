# Spec 4 — Worklog

## Estado: implementado, verificación visual parcial. No se pudo probar el estado `Active` de la Home (grid + movimientos) porque crear una cuenta real requiere el modal del Spec 5, todavía no construido. Se termina de verificar ahí.

## Hecho

### Configuración / fixes heredados
- **Fix de `tsconfig.json` raíz**: no tenía el alias `@/*` (solo `references` a los tsconfig hijos), así que el CLI de `shadcn` no lo resolvía y creaba una carpeta literal `@/` en vez de `src/`. Se agregó `compilerOptions.paths` al root para que el CLI (y cualquier otra herramienta) lo resuelva bien de ahora en más.
- `index.html`: título cambiado a "Acme Credit".
- `index.css`: paleta cambiada a morado estilo Nu (`--primary`/`--ring` en light y dark mode).

### `api/client.ts`
- Reescrito para el envelope estándar del backend (`{statusCode, message, data}` / `{statusCode, message, error}`) — ahora `apiFetch` devuelve `data` directo y lanza `ApiError` (con `status`/`code`) en error.
- `GET /health` (Spec 0) queda explícitamente fuera de este cliente — sigue sin el envelope, así que `TestConnectionPage` le pega con `fetch` nativo.

### Componentes compartidos nuevos
- `common/components/AcmeLogo.tsx` — el logo de la app ("A" en badge), con variante `inverted` para fondos oscuros (la tarjeta).
- `common/components/PageShell.tsx` — layout compartido por todas las páginas: fondo morado de borde a borde, columna central blanca `max-w-md` de arriba a abajo (`min-h-screen`), con header opcional (logo → `/home`, "Log out" → `/`) que se oculta en Login/Test connection.
- `common/components/ui/{input,label}.tsx` — agregados vía `shadcn add` (sin componente `form` — esta versión del registro no lo tiene; el form de Login usa `react-hook-form` directo con estos primitivos).
- `common/components/ui/button.tsx` — se agregó `cursor-pointer` al base de `buttonVariants` (Tailwind lo resetea a `default` por su preflight).
- `common/types/{account,transaction}.ts`, `common/utils/money.ts` (`formatCents`, formato `$ -445,983.17`).

### Módulo Accounts (frontend)
- `features/accounts/services/accountsService.ts` — `getAccountMe()`.
- `features/accounts/components/CreditCardView.tsx` — la tarjeta con los 5 estados visuales (colores de la bolita, prioridad ya resuelta por el backend vía `display_status`), logo, marca de Mastercard (2 círculos), "Current debt" solo si `Active`; y `CreateCardPlaceholder` (silueta punteada, ícono `+` arriba del texto, hover blanco).
- `features/accounts/components/AccountGrid.tsx` — el grid 2x2 (`Available limit` con el total como texto secundario / `Statement date`, `Minimum payment` / `Payment due date`).

### Módulo Transactions (frontend)
- `features/transactions/services/transactionsService.ts` — `listTransactions(page, pageSize)`.
- `features/transactions/components/TransactionsList.tsx` — lista reusable (ícono = `AcmeLogo`, nombre+fecha, monto con signo); la usa la Home con `page_size=6`.

### Páginas y router
- `pages/Login.tsx` — username/password precargados (`john.doe` / `TempPass123!`), cualquier valor navega a `/home` (sin auth real).
- `pages/Home.tsx` — `useQuery(['account','me'])`; `404` → `CreateCardPlaceholder`; cuenta existente → tarjeta + (si `Active`) grid + primeros 6 movimientos + "View all transactions" (→ `/transactions`, Spec 7).
- `router.tsx` — rutas `/` (Login), `/home` (Home), `/test-connection` (preservada del Spec 0), `*` (página "not built yet" con el mismo `PageShell`).

## Probado

- `npm run build` (TypeScript + Vite) pasa limpio en cada iteración.
- Las 3 rutas reales sirven `200` (`/`, `/home`, `/test-connection`).
- `GET /accounts/me` contra el backend real devuelve `404 ACCOUNT_NOT_FOUND` (no hay cuenta todavía) — confirma que la rama `CreateCardPlaceholder` de la Home se ejercita contra datos reales, no solo en el código.

## No probado (pendiente, se cierra en Spec 5)

- **Todo lo visual** (colores, layout, el header, el logo, el "+" sobre "Create card") — no hay navegador conectado en esta sesión; el usuario lo revisó manualmente en `localhost:5173` e hizo los ajustes de este worklog a partir de lo que vio.
- **El estado `Active` completo de la Home** (tarjeta verde, grid 2x2 con datos reales, lista de movimientos) — no se puede llegar a ese estado sin crear una cuenta real, y crearla requiere el modal de "Crear tarjeta garantizada" del Spec 5. Queda para verificar ahí, junto con el resto de los estados (`Frozen`, `Overdue`, etc.) que tampoco son alcanzables sin acciones de Spec 5/6.

## Decisiones de implementación no especificadas en `infra.md`/`requirements.md`

- **Logo de Acme**: no existe asset real, se usa una "A" estilizada en un badge (componente `AcmeLogo`), reusado en el header, la tarjeta y el ícono de movimientos — pedido explícito del usuario durante la sesión.
- **Ícono de movimientos**: `infra.md` dice "logo de Acme" sin más detalle — se implementó como el mismo `AcmeLogo`.
- **"Cardholder"/usuario actual del login**: sin backend de auth, el formulario no llama a ningún endpoint; solo navega a `/home` tras cualquier submit válido (no vacío).
