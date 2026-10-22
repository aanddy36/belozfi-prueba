# Spec 0 — Infrastructure (bootstrap + deploy)

## Objetivo

Levantar el esqueleto de frontend, backend y base de datos (sin lógica de negocio todavía), probar que las 3 piezas están conectadas entre sí tanto en local como desplegadas, y dejar el pipeline de deploy funcionando para el resto de specs.

## Alcance

**Incluye:** scaffold de los 3 proyectos, script de desarrollo local, botón de prueba de conexión, deploy inicial a Netlify/Render/Supabase con auto-deploy en push a `main`.

**No incluye:** ningún endpoint de negocio (Accounts, Cards, etc.), ninguna tabla de datos todavía (eso es el Spec 1), ninguna pantalla real del frontend más allá del botón de prueba.

## Backend (`backend/`)

### Stack

FastAPI + Pydantic + SQLAlchemy. **Sin Alembic** — el esquema se crea con un script manual (ver Spec 1), no con migraciones.

### Estructura de carpetas (feature-based)

```
backend/
├── .env / .env.example
├── requirements.txt
├── iac/                          # Spec 8 — un .yaml por feature asíncrona, no desplegado
│   ├── extractos.yaml
│   ├── intereses.yaml
│   └── mora.yaml
└── app/
    ├── main.py                    # instancia FastAPI, registra routers, CORS
    ├── core/
    │   └── config.py               # carga de env vars (pydantic-settings)
    ├── db/
    │   └── session.py              # engine, SessionLocal, get_db dependency
    ├── shared/
    │   ├── models/                 # ORM compartido: User, LedgerEntry, IdempotencyKey
    │   └── utils/                  # idempotency.py, locking.py, ledger.py
    └── modules/
        ├── accounts/
        │   ├── controller.py
        │   ├── model.py
        │   ├── schema.py
        │   ├── route.py
        │   └── service.py
        ├── cards/          # misma convención de 5 archivos
        ├── collateral/
        ├── purchases/
        ├── payments/
        └── transactions/
```

Cada módulo es un conjunto de **archivos**, no subcarpetas (son chicos, no justifican una carpeta por capa). `controller.py` orquesta la request, `service.py` tiene la lógica de negocio/transacción, `model.py` es el ORM, `schema.py` son los DTOs Pydantic, `route.py` registra el router de ese módulo.

### Este spec en particular

- Endpoint `GET /health`: hace un `SELECT 1` contra la DB y responde `{ "status": "ok", "db": "ok" }` (o el error correspondiente si la DB no responde).
- CORS configurado para aceptar el origen del frontend (local primero, se agrega el dominio de Netlify al desplegar).
- `requirements.txt` con: `fastapi`, `uvicorn`, `sqlalchemy`, `psycopg2-binary`, `python-dotenv`, `pydantic-settings`.
- En este spec, `modules/` queda vacía salvo por lo que ya exista de `app/main.py` + `/health` — los 6 módulos se construyen en los Specs 2-3.

## Frontend (`frontend/`)

### Stack

React + Vite + TypeScript, con: `react-router-dom`, `zod`, `react-hook-form` + `@hookform/resolvers`, `zustand`, `tailwindcss`, shadcn/ui, `@tanstack/react-query`, `date-fns`, `lucide-react`, `sonner`.

### Estructura de carpetas (feature-based)

```
frontend/src/
├── main.tsx
├── App.tsx
├── router.tsx                  # definición de rutas, importado en App.tsx
├── api/
│   └── client.ts                # wrapper de fetch: base URL, manejo de Idempotency-Key
├── common/
│   ├── components/
│   │   └── ui/                  # primitivas generadas por shadcn (button, dialog, etc.)
│   ├── hooks/
│   ├── utils/
│   └── types/                   # tipos TS compartidos (Account, Card, Purchase, etc.)
├── features/
│   └── {feature}/
│       ├── components/
│       ├── hooks/
│       ├── services/            # llamados a la API de esta feature (usan api/client.ts)
│       └── store/                # Zustand, solo si la feature necesita estado propio
└── pages/
    ├── Login.tsx
    ├── Home.tsx
    ├── Card.tsx
    └── Transactions.tsx
```

En este spec, `features/` queda vacía (sin código real todavía) — las carpetas de cada feature (`accounts/`, `cards/`, `collateral/`, `purchases/`, `payments/`, `transactions/`, `auth/`) se crean en los Specs 4-7, siguiendo esta misma convención.

### Pantalla de este spec

Una sola pantalla, sin router todavía más que la raíz: botón **"Test connection"**.
- Al hacerlo, llama a `GET {VITE_API_URL}/health` (vía `api/client.ts`).
- Si responde `status: ok` y `db: ok` → `sonner` muestra un toast de éxito.
- Si falla (red o DB) → toast de error con el motivo.

### Configuración

- `.env` (gitignored) + `.env.example` (committed, con placeholders) — variable `VITE_API_URL`, apunta a `http://localhost:8000` en local.
- `components.json` de shadcn configurado para que genere en `src/common/components/ui/`.

## Base de datos local

- Postgres instalado directo en la máquina (sin Docker — ver `infra.md` sección 5).
- Crear la DB `acme_credit` local.
- No se crean tablas en este spec — alcanza con que el backend pueda conectarse y hacer `SELECT 1`.

## Script de desarrollo local

Un script en la raíz del repo (`scripts/dev.sh` o equivalente) que levanta:
- Backend: `uvicorn app.main:app --reload --port 8000` (desde `backend/`).
- Frontend: `npm run dev -- --port 5173` (desde `frontend/`).
- Postgres: se asume corriendo como servicio del sistema (no lo gestiona el script).

## Deploy

| Servicio | Configuración |
|---|---|
| **Netlify** | Conectar el repo de GitHub. Base directory: `frontend/`. Build command: `npm run build`. Publish directory: `frontend/dist`. Auto-deploy en push a `main`. |
| **Render** | Conectar el repo de GitHub. Root directory: `backend/`. Build command: `pip install -r requirements.txt`. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Auto-deploy en push a `main`. Env var `DATABASE_URL` apuntando a Supabase. |
| **Supabase** | Crear el proyecto, obtener la connection string. No tiene auto-deploy — el schema se aplica una sola vez de forma manual (Spec 1), sin hook de CI/CD. |

- Configurar `VITE_API_URL` en Netlify apuntando a la URL pública del backend en Render.
- Actualizar el CORS del backend para aceptar el dominio de Netlify, además de `localhost`.

## Criterios de aceptación

- [ ] `scripts/dev.sh` levanta frontend (puerto 5173) y backend (puerto 8000) con un solo comando.
- [ ] En local, tocar "Test connection" muestra el toast de éxito.
- [ ] Un push a `main` actualiza automáticamente el sitio de Netlify y el servicio de Render, sin pasos manuales.
- [ ] En la app desplegada (Netlify), tocar "Test connection" muestra el toast de éxito, confirmando que Netlify → Render → Supabase están conectados de punta a punta.
