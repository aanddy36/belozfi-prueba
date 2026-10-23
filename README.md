# Acme Credit — Secured Credit Card Service

Prueba técnica: servicio de tarjeta de crédito garantizada (secured credit card). El cliente deposita una garantía (collateral), esa garantía define su cupo, y puede gastar contra ese cupo con autorización en tiempo real, pagar lo gastado y recuperar la garantía al cerrar la cuenta en buen estado.

Instrucciones originales de la prueba: [`specs/product/CHALLENGE.md`](specs/product/CHALLENGE.md). Reglas de negocio: [`specs/product/product.md`](specs/product/product.md). Decisiones de infraestructura y diseño: [`specs/product/infra.md`](specs/product/infra.md).

## Demo en vivo

No hace falta clonar el repo para probarlo — está desplegado de punta a punta:

- **Frontend**: https://belozfi-prueba.netlify.app/
- **Backend**: `https://belozfi-prueba.onrender.com` (Render free tier — el servicio "duerme" tras inactividad; la primera request puede tardar ~30-50s en despertar)
- **Base de datos**: Supabase (Postgres hosteado)

## Arquitectura

**Monolito modular (Core API) + Billing Worker asíncrono separado**, en vez de microservicios completos desde el día uno.

La razón: el núcleo del negocio (garantía → cupo → compra → repago) necesita consistencia transaccional fuerte sobre una misma fila de cuenta — partirlo en microservicios desde el inicio solo agrega complejidad de coordinación distribuida (sagas, consistencia eventual) sin ningún beneficio real a esta escala. En cambio, sí separa claramente:

- **Core API** (`backend/`, FastAPI): todo lo síncrono y crítico en consistencia — depósito, activación, autorización de compras, repagos, congelar/cerrar cuenta. Organizado por módulos de dominio (`app/modules/accounts`, `cards`, `collateral`, `purchases`, `payments`, `transactions`), cada uno con su `route` → `controller` → `service` → `model`.
- **Billing Worker** (documentado, no desplegado — ver [Fuera de alcance](#fuera-de-alcance-del-mvp)): todo lo asíncrono/programado (extractos, intereses, mora). Se separa del Core API porque corre en otro ciclo de vida (cron, no request-response) y no debe competir por recursos ni arriesgar la disponibilidad de la API síncrona.

Esta separación es la que permitiría, si el producto creciera, extraer el worker a su propio servicio/proceso sin tocar el núcleo — es un camino hacia microservicios, no una renuncia a ellos.

> **Nota sobre el repo**: `frontend/` y `backend/` conviven en un único repo por practicidad de esta prueba técnica. En un sistema real no estarían en el mismo repo — cada uno tiene su propio ciclo de deploy, versionado y equipo dueño. Lo mismo aplica a los procesos asíncronos de la sección 2.2.1-2.2.3 de `infra.md` (extractos, intereses, mora): cada uno está diseñado para correr como su propio servicio desplegable (su propio stack de Lambdas/colas/cron), no como parte del Core API — acá quedan documentados juntos en `backend/iac/` solo porque este demo no los despliega.

Detalle completo de la arquitectura, stack y alternativas consideradas: [`specs/product/infra.md`](specs/product/infra.md).

### Garantías del servicio crítico

- **Concurrencia**: toda operación que lee y modifica el saldo de una cuenta (compra, pago, aplicación de garantía) toma `SELECT ... FOR UPDATE` al inicio de su transacción — serializa operaciones simultáneas sobre la misma cuenta y evita *lost updates* (ej. dos compras a la vez con el mismo cupo).
- **Idempotencia**: las mutaciones (`POST`/`PATCH`) que mueven dinero requieren header `Idempotency-Key`, con tabla propia (`idempotency_keys`) que guarda la respuesta ya calculada — un reintento de red no duplica la operación. Las operaciones naturalmente idempotentes (ej. `PATCH /cards/freeze`, que fija un estado explícito) quedan exentas.
- **Auditabilidad**: `ledger_entries` es un log append-only de todo movimiento de cuenta — fuente de verdad auditable, independiente de los saldos cacheados en `accounts` (que existen solo para lectura rápida del camino caliente).
- **Montos**: todo en centavos (enteros), nunca `float`, para evitar errores de redondeo en dinero real.
- **Datos financieros simulados, no reales**: sin integración bancaria, sin pasarela de pagos, sin tokenización PCI de tarjeta — explícitamente habilitado por `CHALLENGE.md` para este demo.

## Decisiones clave y por qué

Resumen de lectura rápida de las decisiones de arquitectura/diseño más relevantes. Cada una linkea a donde está el detalle completo — pensado para no tener que recorrer los 9 specs para entender el porqué de cada cosa.

| Decisión | Por qué | Detalle |
|---|---|---|
| Monolito modular (Core API) + worker asíncrono separado, no microservicios desde el día 1 | El núcleo (garantía → cupo → compra → repago) necesita consistencia transaccional fuerte sobre una misma fila de cuenta; partirlo en microservicios desde el inicio agrega coordinación distribuida sin beneficio real a esta escala | [`infra.md`](specs/product/infra.md), [Arquitectura](#arquitectura) arriba |
| `SELECT ... FOR UPDATE` al inicio de toda operación que toca el saldo | Evita *lost updates* si dos operaciones (ej. dos compras) llegan a la vez sobre la misma cuenta | [`infra.md` §3 Concurrencia](specs/product/infra.md), [Spec 2 requirements.md](specs/engineering/2-accounts-cards-api/requirements.md), `backend/app/shared/utils/locking.py` |
| Montos siempre en centavos (enteros), nunca `float` | Evita errores de redondeo en dinero real | [`infra.md` §4.4](specs/product/infra.md) |
| `Idempotency-Key` obligatorio en mutaciones que mueven dinero, con tabla propia | Un reintento de red (ej. doble-click, timeout del cliente) no duplica la operación | [Spec 2 requirements.md § Idempotencia](specs/engineering/2-accounts-cards-api/requirements.md), `backend/app/shared/utils/idempotency.py` |
| `ledger_entries` append-only como fuente de verdad, separado del saldo cacheado en `accounts` | Auditabilidad: el saldo cacheado es solo para lectura rápida; el ledger es lo que se reconcilia | [`infra.md`](specs/product/infra.md) tabla `ledger_entries`, `backend/app/shared/utils/ledger.py` |
| Confirmación del depósito de garantía *lazy* (se evalúa el timer de 10s al leer, no un scheduler real) | Para este MVP no hace falta infraestructura de background jobs — alcanza con una condición en el camino de lectura (`GET /accounts/me` hace polling) | [`infra.md` §2.2.4](specs/product/infra.md) |
| `GET /accounts/me` sin cuenta devuelve `200` con `data: null`, no `404` | No tener cuenta todavía es el estado normal de un cliente nuevo, no un error — decisión revisada tras notar el problema real probando el frontend (Spec 5) | [Spec 2 requirements.md § Decisión revisada](specs/engineering/2-accounts-cards-api/requirements.md) |
| Sin Docker para la DB local | El evaluador interactúa con la demo ya desplegada, no clona y levanta el proyecto desde cero — esa reproducibilidad no aplicaba acá | [`infra.md` §5](specs/product/infra.md), [Cómo correrlo en local](#cómo-correrlo-en-local) abajo |
| Jobs asíncronos (extractos, intereses, mora) diseñados + con IaC, pero **no desplegados** | No había rol administrativo que los necesitara operar en este demo; se prioritizó el flujo síncrono crítico dentro del plazo de 5 días | [`infra.md` §4.2](specs/product/infra.md), [`backend/iac/`](backend/iac) |
| Sin autenticación/autorización real, KYC, integración bancaria, ni tokenización PCI | Explícitamente habilitado por `CHALLENGE.md` para este demo — simular en vez de integrar servicios reales | [`CHALLENGE.md`](specs/product/CHALLENGE.md), [`infra.md` §4.4](specs/product/infra.md) |
| `frontend/` y `backend/` en un único repo | Practicidad para esta prueba técnica; en un sistema real no compartirían repo, y cada job asíncrono sería su propio servicio desplegable | [Nota sobre el repo](#arquitectura) arriba |

## Cómo correrlo en local

No hace falta — la demo ya está desplegada (ver arriba) — pero si querés levantarlo localmente:

**Requisitos**: Python 3.12, Node.js, y una instancia de Postgres accesible (local o remota).

```bash
# 1. Backend: crear venv, instalar dependencias, configurar .env
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # ajustar DATABASE_URL a tu Postgres

# 2. Frontend: instalar dependencias, configurar .env
cd ../frontend
npm install
cp .env.example .env   # por defecto apunta a http://localhost:8000

# 3. Levantar ambos a la vez desde la raíz del repo
cd ..
./scripts/dev.sh
```

[`scripts/dev.sh`](scripts/dev.sh) levanta el backend (`uvicorn`, puerto 8000) y el frontend (`vite`, puerto 5173) juntos, en segundo plano. El schema de base de datos está en [`specs/engineering/1-database`](specs/engineering/1-database) (`schema.sql` + modelos SQLAlchemy) — hay que aplicarlo contra el Postgres que apunte tu `DATABASE_URL` antes de arrancar.

No se usa Docker para la DB local: se decidió así porque el evaluador interactúa con la demo ya desplegada, no clona y levanta el proyecto desde cero — ver el razonamiento completo en [`specs/product/infra.md`](specs/product/infra.md), sección 5.

## Stack

- **Backend**: Python, FastAPI, SQLAlchemy, Postgres (vía `psycopg2`)
- **Frontend**: React, TypeScript, Vite
- **Infra real desplegada**: Netlify (frontend) + Render (backend) + Supabase (Postgres)
- **IaC** (documentado, no desplegado): AWS SAM/CloudFormation para los jobs asíncronos — ver [`backend/iac`](backend/iac)

## Estructura del proyecto

```
backend/app/modules/     # accounts, cards, collateral, purchases, payments, transactions
backend/app/shared/      # ledger, idempotencia, locking, lookup de cuenta — compartido entre módulos
backend/iac/             # IaC de los procesos async (extractos, intereses, mora) — no desplegado
frontend/src/features/   # un folder por dominio de negocio, espejo de los módulos del backend
frontend/src/pages/      # Login, Home, /card, /transactions
specs/product/           # CHALLENGE.md (enunciado), product.md (reglas de negocio), infra.md (diseño técnico)
specs/engineering/       # 9 specs (0-8), uno por entregable — requirements.md + design.md + worklog.md cada uno
.ai/prompts.md           # historial completo de interacción con IA durante el build, en orden cronológico
```

## Uso de IA

Todo el proceso de diseño y construcción se hizo dirigiendo a un asistente de IA (Claude) con instrucciones explícitas, no preguntándole cómo pensar. El historial completo y cronológico de prompts y respuestas está en [`.ai/prompts.md`](.ai/prompts.md).

## Fuera de alcance del MVP

Documentado en detalle en [`specs/product/infra.md`](specs/product/infra.md), sección 4. Resumen:

- Los jobs asíncronos (extractos, acumulación de intereses, escalado de mora) están diseñados y tienen su IaC (`backend/iac/`), pero **no se despliegan ni se ejecutan** — la aplicación de garantía a deuda vencida a los 30 días (`product.md`, sección 5) queda, en consecuencia, fuera de alcance real de este demo. La liberación de garantía al cerrar cuenta en buen estado sí está implementada.
- No hay roles administrativos — la confirmación del depósito de garantía se simula con un timer automático de 10 segundos en vez de una revisión manual/de riesgo.
- No hay autenticación/autorización real, KYC, integración bancaria real, pasarela de pagos, ni tokenización PCI de tarjeta — habilitado explícitamente por `CHALLENGE.md` para este demo.
