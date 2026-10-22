# Spec 4 — Frontend: Login & Home

## Objetivo

Construir las dos primeras pantallas de la app: Login y Home, consumiendo los endpoints de Accounts del Spec 2.

## Alcance

**Incluye:** pantalla de Login, pantalla de Home con sus 2 estados (sin tarjeta / con tarjeta), el diseño de la tarjeta con sus 5 estados visuales, el grid 2x2, y la lista de movimientos (primeros 6, solo lectura por ahora — "Pay"/"Simulate purchase" son el Spec 5).

**No incluye:** los modales de acción (Spec 5), la página `/card` (Spec 6), la página `/transactions` (Spec 7).

## Referencia

El diseño completo ya está en `specs/product/infra.md`, sección "1. Frontend". Esta spec es la implementación de ese diseño.

## UI en inglés (ver `infra.md`)

Todo el texto de la interfaz va en inglés, aunque la documentación del proyecto esté en español.

## Login

- Título "Acme Credit", campos usuario/contraseña.
- Cualquier valor ingresado inicia sesión (sin validación real — no hay auth).
- Sin opción de crear cuenta.
- Redirige a `/home`.

## Home

- `GET /accounts/me` al cargar. Si `404` → silueta de tarjeta punteada, gris, texto "Create card" centrado, hover blanco (el click que abre el modal de creación es el Spec 5).
- Si existe cuenta → renderiza la tarjeta real con su estado.

### Diseño de la tarjeta

- Paleta morada estilo Nu (indicarlo en el frontend).
- Arriba-izq: logo Acme. Arriba-der: "Credit", con la bolita de estado justo debajo.
- Abajo-der: logo Mastercard. Abajo-izq (solo si `Active`): "Current debt" + monto.
- Colores de estado: Pending=amarillo, Active=verde, Frozen=celeste, Cancelled=gris, Overdue=rojo.
- Prioridad de estado: `Cancelled > Pending > Frozen > Overdue > Active`.

### Debajo de la tarjeta (solo si `Active`)

- Grid 2x2: "Available limit" (con el cupo total como texto secundario) / "Statement date", "Minimum payment" / "Payment due date".
- Lista de movimientos: primeros 6 (`GET /transactions?page=1&page_size=6`), ícono = logo de Acme, nombre + fecha, monto a la derecha (`$ -445,983.17` / positivo para pagos). Botón "View all transactions" (navega a `/transactions`, Spec 7).

## Criterios de aceptación

- [ ] Cualquier usuario/contraseña en Login redirige a `/home`.
- [ ] Sin cuenta: se ve la silueta punteada con hover.
- [ ] Con cuenta `active`: se ven los 4 datos del grid con valores reales, y los primeros 6 movimientos (o menos si hay menos).
- [ ] El color/prioridad de la bolita de estado es correcto en todos los casos simulables (activar freeze manualmente en DB para probar `Frozen`, por ejemplo).
- [ ] Formato de montos consistente: `$ -445,983.17`.
