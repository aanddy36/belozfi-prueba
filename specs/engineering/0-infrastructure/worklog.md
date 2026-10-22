# Spec 0 — Worklog

## Estado: completo. Scaffold, prueba local y deploy (Netlify + Render + Supabase) funcionando de punta a punta.

## Hecho

### Backend (`backend/`)
- Virtualenv (`venv/`) con `requirements.txt` instalado (fastapi, uvicorn, sqlalchemy, psycopg2-binary, python-dotenv, pydantic-settings).
- Estructura de carpetas creada: `app/core`, `app/db`, `app/shared/{models,utils}`, `app/modules` (vacía, como define el alcance de este spec), `iac/` (vacía, para Spec 8).
- `app/core/config.py`, `app/db/base.py`, `app/db/session.py`, `app/main.py` (con `GET /health`) creados según `design.md`.
- `.env.example` creado; `.env` real creado en local (gitignored).

### Frontend (`frontend/`)
- Scaffold con `npm create vite@latest . -- --template react-ts` (React 19, Vite 8, TypeScript).
- Instaladas las libs de Spec 0: `react-router-dom`, `zod`, `react-hook-form`, `@hookform/resolvers`, `zustand`, `@tanstack/react-query`, `date-fns`, `lucide-react`, `sonner` (instalado con `--legacy-peer-deps` por un conflicto de peer deps opcionales de `@hookform/resolvers` ajeno a zod).
- Tailwind **v4** (`tailwindcss` + `@tailwindcss/vite`, sin `postcss`/`tailwind.config.js` — es el setup nativo de v4) en vez del v3 que mencionaba `design.md` originalmente, por ser el estable al momento de este spec.
- `shadcn init` corrido (preset Nova, base Radix, color base neutral — la paleta morada estilo Nu se aplica recién en el spec de frontend real). `components.json` configurado para generar en `src/common/components/ui/`.
- Estructura de carpetas creada: `api/`, `common/{components/ui,hooks,utils,types}`, `features/` (vacía), `pages/` — solo con `TestConnectionPage.tsx` en este spec.
- `App.tsx`, `router.tsx`, `api/client.ts`, `pages/TestConnectionPage.tsx` creados según `design.md`.
- Alias `@/*` → `src/*` configurado en `tsconfig.app.json` + `vite.config.ts`.
- `.env.example` / `.env` (`VITE_API_URL`) creados.
- `npm run build` corre sin errores ni warnings.

### `scripts/dev.sh`
- Levanta backend (`uvicorn --reload --port 8000`) y frontend (`vite --port 5173`) en paralelo con un solo comando.

### `.gitignore`
- Raíz: `venv/`, `.env` de backend, `__pycache__/`, `node_modules/`, `dist/` del frontend.
- `frontend/.gitignore` (el que genera Vite) complementado con `.env` explícito (Vite no lo ignora por default).

### Deploy
- **Supabase**: proyecto creado en `us-west-2`. La connection string "Direct connection" (`db.<ref>.supabase.co`) solo resuelve por IPv6 (sin registro `A`) — quedó inutilizable en la red usada para probar. Se usó en su lugar la del **Session pooler** (`postgres.<ref>@aws-1-us-west-2.pooler.supabase.com:5432`), que sí resuelve por IPv4 y funciona bien. Data API (PostgREST), auto-expose de tablas y RLS automática quedaron **deshabilitadas** — no se usa `supabase-js` ni ningún client library, el backend habla directo a Postgres.
- **Render**: Web Service, root directory `backend/`, build `pip install -r requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, región Oregon (misma región AWS que Supabase). Env vars: `DATABASE_URL` (string del pooler de Supabase) y `CORS_ORIGINS` (incluyendo el dominio de Netlify).
- **Netlify**: Base directory `frontend/`, build `npm run build`, publish directory `dist` (relativo al base directory). Env var `VITE_API_URL` apuntando a la URL pública de Render.

## Desvíos respecto al `design.md` original (ya actualizados ahí)

- **Postgres local**: en vez de crear un role `acme_app` + DB `acme_credit` (como decía el `design.md` original), se usó directo el superusuario `postgres` contra una DB `acme_app` ya creada manualmente en pgAdmin — decisión explícita de mantenerlo simple para este MVP. `design.md` sección 0 se actualizó para reflejar esto.
- **CORS_ORIGINS**: se agregó como variable de entorno nueva (no estaba en el `.env.example` original) para poder listar más de un origen sin tocar código — necesario tanto en local (Vite corrió en el puerto 5174 en una prueba) como en producción (dominio de Netlify).
- **`backend/.python-version` (nuevo archivo)**: Render usaba Python 3.14 por default (sin pin previo), y `psycopg2-binary` no tiene wheels para esa versión — rompía el build con `ModuleNotFoundError: No module named 'psycopg'`. Se fijó `3.12.8`.
- **Driver explícito en `DATABASE_URL`**: `postgresql+psycopg2://` en vez de `postgresql://` a secas. SQLAlchemy 2.1 (instalado en Render) cambió el driver default de `postgresql://` genérico de `psycopg2` a `psycopg` (v3), rompiendo el deploy aunque `psycopg2-binary` estuviera instalado — localmente no se notó porque el venv local tiene SQLAlchemy 2.0.55 (default viejo). Se actualizaron `backend/.env`, `backend/.env.example` y `design.md`.

## Probado

- `GET /health` standalone (backend solo, sin frontend): `{"status":"ok","db":"ok"}`.
- Stack completo local (`scripts/dev.sh`) en `http://localhost:5173`: botón "Test connection" → toast **"Connection OK: backend + DB reachable"**.
- Deploy completo: `https://belozfi-prueba.onrender.com/health` → `{"status":"ok","db":"ok"}` contra Supabase. `https://belozfi-prueba.netlify.app` → "Test connection" → toast de éxito, confirmando Netlify → Render → Supabase conectados de punta a punta.
