# Spec 0 — Worklog

## Estado: scaffold + prueba local completos. Deploy pendiente.

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

## Desvíos respecto al `design.md` original (ya actualizados ahí)

- **Postgres local**: en vez de crear un role `acme_app` + DB `acme_credit` (como decía el `design.md` original), se usó directo el superusuario `postgres` contra una DB `acme_app` ya creada manualmente en pgAdmin — decisión explícita de mantenerlo simple para este MVP. `design.md` sección 0 se actualizó para reflejar esto.
- **CORS_ORIGINS**: se agregó como variable de entorno nueva (no estaba en el `.env.example` original) para poder listar más de un origen local sin tocar código — necesario porque Vite corrió en el puerto 5174 en una prueba (5173 estaba ocupado por otro proyecto del usuario).

## Probado

- `GET /health` standalone (backend solo, sin frontend): `{"status":"ok","db":"ok"}`.
- Stack completo (`scripts/dev.sh`) en `http://localhost:5173`: botón "Test connection" → toast **"Connection OK: backend + DB reachable"**, confirmado por el usuario en el navegador.

## Pendiente

- Deploy a Netlify (frontend), Render (backend) y Supabase (DB), y la prueba de "Test connection" contra la demo desplegada.
