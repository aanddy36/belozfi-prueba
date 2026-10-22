# Spec 5 — Frontend: Create card, Pay & Simulate purchase modals

## Objetivo

Construir los 3 modales de acción que mueven plata, conectados a los endpoints del Spec 2/3.

## Alcance

**Incluye:** modal "Create card" (depósito inicial), modal "Pay", modal "Simulate purchase" + el botón flotante que lo abre.

**No incluye:** el modal "Add collateral" ni "Cancel card" (esos van en la página `/card`, Spec 6, aunque reusan patrones de este spec).

## Referencia

Diseño completo en `specs/product/infra.md`, sección "1. Frontend".

## Modal "Create card"

- Se abre al hacer click en la silueta punteada de la Home (cuando no hay cuenta).
- Un campo: monto del depósito. Validación mínimo $1.000 (frontend y backend).
- Al confirmar: `POST /accounts` con `Idempotency-Key`. La Home pasa a mostrar la tarjeta en `Pending`, y empieza el polling a `GET /accounts/me` cada 1-2s mientras siga `pending`.

## Modal "Pay"

- Se abre con el botón "Pay" (solo visible si `Active`).
- Título: "How much do you want to pay?". Subtítulo izq: "Select the amount to pay".
- 3 radio buttons: **Minimum payment** / **Full payment** / **Other amount** — valores de los dos primeros mostrados a la derecha de cada opción (vienen de `GET /accounts/me`).
- Al elegir "Other amount", aparece un input (mínimo $25).
- Botón "Confirm" → `POST /payments` con `Idempotency-Key`.

## Botón "Simulate purchase" + su modal

- Botón "+" circular, color primary, `fixed`, derecha, centrado verticalmente. **Visible solo si la tarjeta está `Active`.**
- Modal: campo "Merchant name" (texto libre), campo monto, selector de plan de cuotas (1/3/6/12).
- Validación: monto no excede `available_credit_cents` (frontend, más la validación real del backend).
- Confirmar → `POST /purchases` con `Idempotency-Key`.

## Criterios de aceptación

- [ ] "Create card" con monto < $1.000 muestra error sin llamar al backend.
- [ ] Después de confirmar el depósito, la Home muestra `Pending` y hace polling hasta pasar a `Active` a los 10s.
- [ ] El modal "Pay" muestra los valores correctos de mínimo y total, tomados de la cuenta real.
- [ ] Pagar "Other amount" por debajo de $25 (con deuda mayor a $25) muestra error sin llamar al backend.
- [ ] El botón "+" no aparece si la tarjeta no está `Active`.
- [ ] Simular una compra que excede el cupo disponible muestra error (validado también por el backend, no solo el frontend).
- [ ] Después de cualquiera de las 3 acciones, la Home refleja el nuevo estado (cupo, deuda, movimientos) sin necesitar un refresh manual.
