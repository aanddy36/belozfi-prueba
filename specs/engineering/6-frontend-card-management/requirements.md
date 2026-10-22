# Spec 6 — Frontend: Card management page (`/card`)

## Objetivo

Construir la página a la que se llega al hacer click en la tarjeta desde la Home: congelar, ver detalles, agregar garantía, y cancelar la tarjeta.

## Alcance

**Incluye:** ruta `/card` completa.

**No incluye:** la ruta `/transactions` (Spec 7).

## Referencia

Diseño completo en `specs/product/infra.md`, sección "1. Frontend" (ruta `/card`).

## Contenido de la página

- Misma tarjeta, misma posición, arriba de la página. Botón "Back to home".
- Toggle **"Freeze card"** → `PATCH /cards/freeze`.
- 3 botones: **"View details"** / **"Cancel card"** / **"Add collateral"**.
- Sección **"Collateral deposited"**: lista con el mismo estilo que los movimientos (ícono = logo Acme, fecha arriba, estado abajo, monto a la derecha) — `GET /collateral-deposits`.

### "View details"

- Al hundirlo: `GET /cards/me/details`. La tarjeta cambia de cara — se ocultan logo Acme/Mastercard/"Current debt", aparecen número, nombre del titular, "Exp: __/__", "CVC: ___". "Credit" y la bolita de estado se mantienen.
- El botón cambia a "Hide details" con ícono de ojo tachado.

### "Add collateral"

- Abre el mismo modal de depósito del Spec 5 (monto, mínimo $1.000), pero llama a `POST /collateral-deposits` en vez de `POST /accounts`.

### "Cancel card"

- Abre un modal de confirmación.
- Al confirmar: `POST /accounts/close`. Si el backend devuelve `409` (deuda pendiente), se muestra el motivo y no se cierra nada.

## Criterios de aceptación

- [ ] El toggle de Freeze refleja el estado real de `cards.status` y lo cambia correctamente.
- [ ] "View details" muestra los 4 datos sensibles y el botón cambia a "Hide details" con el ícono correcto; volver a hundirlo oculta los datos.
- [ ] "Add collateral" con éxito aumenta el cupo total de la cuenta (verificable al volver a la Home).
- [ ] "Cancel card" con deuda pendiente muestra el error y no cierra la cuenta.
- [ ] "Cancel card" con deuda en $0 cierra la cuenta y libera la garantía — la Home vuelve a mostrar la silueta de "Create card".
- [ ] La sección "Collateral deposited" muestra todos los depósitos (iniciales y adicionales), con su estado correcto.
