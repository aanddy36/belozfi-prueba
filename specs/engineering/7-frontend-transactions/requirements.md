# Spec 7 — Frontend: Transactions page (`/transactions`)

## Objetivo

Construir la página de listado completo de movimientos, con paginación.

## Alcance

**Incluye:** ruta `/transactions` completa.

## Referencia

Diseño completo en `specs/product/infra.md`, sección "1. Frontend" (ruta `/transactions`).

## Contenido de la página

- Se llega desde el botón "View all transactions" de la Home.
- Lista completa de movimientos (`GET /transactions?page=&page_size=20`), más reciente primero.
- Mismo formato de ítem que la Home (ícono = logo Acme, nombre + fecha, monto a la derecha con signo según tipo).
- Paginación básica de a 20.
- Botón "Back to home".

## Criterios de aceptación

- [x] La página muestra todos los movimientos de la cuenta, paginados de a 20.
- [x] Cambiar de página trae el siguiente lote correctamente, sin duplicar ni saltear ítems.
- [x] El formato de monto y signo es idéntico al de la lista resumida de la Home (mismo componente `TransactionsList`).
- [x] "Back to home" vuelve a `/home` sin perder el estado de la sesión.
