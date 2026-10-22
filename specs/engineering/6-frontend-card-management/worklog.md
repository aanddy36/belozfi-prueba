# Spec 6 — Worklog

## Estado: completo. El usuario probó las 3 acciones de mutación (Freeze, Add collateral, Cancel card) en el navegador real y confirmó que todo funciona, tras una ronda de ajustes de UX.

## Hecho

### Backend (prerrequisito, ver `worklog.md` de Spec 2/3 para el detalle completo)
- `app/shared/utils/account_lookup.py` (nuevo) — `find_account_by_user`, centraliza la búsqueda de "la cuenta vigente del usuario" excluyendo `closed`, para permitir crear una tarjeta nueva después de cancelar. Reemplazó 8 call sites repartidos entre Specs 2 y 3.
- No se agregó ningún endpoint nuevo — los 5 que usa esta spec (`PATCH /cards/freeze`, `GET /cards/me/details`, `POST /collateral-deposits`, `GET /collateral-deposits`, `POST /accounts/close`) ya existían.

### Tipos y services nuevos (frontend)
- `common/types/card.ts` — `CardDetails`.
- `common/types/collateral.ts` — `CollateralDeposit`.
- `features/cards/services/cardsService.ts` — `freezeCard`, `getCardDetails`.
- `features/collateral/services/collateralService.ts` — `createCollateralDeposit`, `listCollateralDeposits`.
- `features/accounts/services/accountsService.ts` — se agregó `closeAccount`.

### Componentes nuevos
- `features/cards/components/FreezeToggle.tsx` — `Switch` de shadcn (agregado con `shadcn add switch`), deshabilitado si `card.status === 'inactive'`.
- `features/collateral/components/AddCollateralModal.tsx` — mismo patrón que `CreateCardModal` (Spec 5), apunta a `POST /collateral-deposits`.
- `features/collateral/components/CollateralDepositsList.tsx` — lista (ícono `AcmeLogo`, fecha arriba, estado abajo, monto a la derecha).
- `features/accounts/components/CancelCardModal.tsx` — confirmación; botón deshabilitado si `current_debt_cents > 0` (el backend sigue siendo la validación real vía `409 OUTSTANDING_BALANCE`); al confirmar, navega a `/home`.

### `CreditCardView.tsx`
- Se agregó el prop opcional `details` — cuando está presente, reemplaza logo/Mastercard/"Current debt" por número formateado ("5555 3333 4444 3333"), titular, "Exp: MM/YY", "CVC: ___". "Credit" + bolita de estado se mantienen siempre.

### `pages/Card.tsx` (nuevo)
- Compone todo: "Back to home", tarjeta (con o sin `details` según el toggle), `FreezeToggle`, los 3 botones (View/Hide details, Cancel card, Add collateral), sección "Collateral deposited" con polling (1.5s) mientras haya algún depósito `pending`, y los 2 modales.
- `GET /cards/me/details` se pide de forma lazy (`enabled: showDetails`) — no se precarga el dato sensible.
- Si no hay cuenta (`account` es `null`), redirige a `/home` (`<Navigate>`).

### Router y Home
- `router.tsx` — se agregó `<Route path="/card" element={<CardPage />} />`.
- `Home.tsx` — la tarjeta ahora es un `<Link to="/card">` (antes no tenía ninguna acción al click).

## Probado

- `npm run build` (TypeScript + Vite) pasa limpio.
- Se verificaron **solo los endpoints de lectura** contra la cuenta real del usuario (sin mutar nada, por el incidente del paso anterior): `GET /cards/me/details` y `GET /collateral-deposits` devuelven datos correctos y coherentes con la cuenta real (1 depósito `confirmed` de $20.000, número/exp/cvc de la tarjeta real).
- Dev server sin errores en el log de Vite tras cada cambio; rutas `/` y `/card` sirven `200`.

## Ronda de ajustes de UX (tras la prueba real del usuario)

- **Hover de la tarjeta**: `hover:` directo sobre la tarjeta (envuelta en un `<Link>`, `inline` por default) no se notaba — se cambió al patrón `group`/`group-hover` (ya probado en "Create card"), con un efecto más marcado (`-translate-y-1`, `shadow-2xl`).
- **Header**: se agregó el texto "Acme Credit" al lado del logo en `PageShell`.
- **Grid/Pay visibles en `Frozen`**: originalmente dependían de `isActive` (solo `Active`) — se cambió a una variable nueva `cardActivated` (`card.status !== 'inactive'`, cubre `Active` y `Frozen`) para el grid, el botón "Pay" y la lista de movimientos de la Home, porque congelar la tarjeta solo debe bloquear compras nuevas, no ver el estado de la cuenta ni pagar deuda. El botón "+"/`SimulatePurchaseModal` se mantuvo estrictamente en `isActive`.
- **`Switch` compartido**: track más oscuro en el estado apagado (`bg-gray-300` en vez del gris casi blanco de shadcn, que se veía "deshabilitado"), con estados `hover:` en ambos lados, y `cursor-pointer`.
- **Orden de botones en `/card`**: se reordenó a View details / Add collateral / Cancel card (antes "Cancel card" quedaba en el medio).
- **Círculo de color por estado en "Collateral deposited"**: igual patrón que la bolita de la tarjeta (`pending` = amarillo, `confirmed` = verde; el sistema no tiene un estado "denied" para depósitos, no se implementó).
- **"Current debt" visible fuera de `Active`**: cambiado de `displayStatus === 'Active'` a `displayStatus !== 'Pending'` — sigue siendo relevante ver la deuda estando `Frozen` (se puede seguir pagando) y de paso corrige un caso que ya estaba mal (`Overdue` tampoco mostraba la deuda antes, siendo el estado donde más importa verla).
- **Botón "Pay" deshabilitado con deuda $0**: causa raíz real encontrada — `CreatePaymentRequest.amount_cents` exige `Field(gt=0)` en el backend, así que "Full payment"/"Minimum payment" en $0 siempre fallaban la validación del schema. Se deshabilita el botón en la Home cuando `current_debt_cents === 0`, en vez de dejar que el usuario llegue a ese error.
- **Cursor `not-allowed` en botones deshabilitados**: `button.tsx` ya tenía `disabled:cursor-not-allowed`, pero también `disabled:pointer-events-none` — con `pointer-events: none` el navegador ignora el elemento al calcular el cursor, así que nunca se veía. Se sacó `disabled:pointer-events-none` (redundante, el atributo `disabled` nativo ya bloquea los clicks). `Switch` no tenía el mismo problema.
- **Botón "Confirm cancellation" sólido**: `variant="destructive"` de `button.tsx` (solo se usaba en este botón en toda la app) pasó de `bg-destructive/10 text-destructive` (rojo clarito) a `bg-destructive text-white` (rojo sólido, texto blanco).

## Aclaración de negocio (no un bug): qué bloquea realmente `Frozen`

El usuario preguntó si `Frozen` debía bloquear agregar garantía o pagar deuda. Se revisó el código (`collateral/service.py`, `payments/service.py`): ninguno de los dos chequea `card.status`/`account.status` más allá de que la cuenta no esté `closed` — por diseño, `Frozen` únicamente bloquea comprar con la tarjeta (`purchases/service.py` sí valida `card.status == 'active'`). Confirmado con el usuario.

## No probado

- Ninguno — el usuario confirmó el flujo completo (incluidas las 3 acciones de mutación) funcionando tras la ronda de ajustes.

## Decisiones de implementación no especificadas en `infra.md`/`requirements.md`

- **Formato del número de tarjeta**: se agrupa de a 4 dígitos (`"5555333344443333"` → `"5555 3333 4444 3333"`) vía regex, sin guardar el dato formateado — el backend sigue devolviendo el string plano de 16 dígitos.
- **Freeze deshabilitado si la tarjeta está `inactive`**: no estaba pedido explícitamente, pero evita una llamada que el backend rechazaría igual con `409 CARD_NOT_ACTIVE` — mejor UX, no cambia ninguna regla de negocio.
- **Polling de "Collateral deposited"**: igual patrón que el de la Home (Spec 5) — `refetchInterval` condicional sobre si hay algún depósito `pending` en la lista actual, no un valor fijo.
