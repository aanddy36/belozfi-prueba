# Spec 0 — Infrastructure (bootstrap + deploy)

## Objetivo

Levantar el esqueleto de frontend, backend y base de datos (sin lógica de negocio todavía), probar que las 3 piezas están conectadas entre sí tanto en local como desplegadas, y dejar el pipeline de deploy funcionando para el resto de specs.

## Alcance

**Incluye:** scaffold de los 3 proyectos, script de desarrollo local, botón de prueba de conexión, deploy inicial a Netlify/Render/Supabase con auto-deploy en push a `main`.

**No incluye:** ningún endpoint de negocio (Accounts, Cards, etc.), ninguna tabla de datos todavía (eso es el Spec 1), ninguna pantalla real del frontend más allá del botón de prueba.

## Backend (`backend/`)

- FastAPI + Uvicorn.
- Estructura: `app/main.py`, `app/core/config.py` (lee `DATABASE_URL` y demás env vars), `app/db/session.py` (conexión a Postgres vía SQLAlchemy).
- Endpoint `GET /health`: hace un `SELECT 1` contra la DB y responde `{ "status": "ok", "db": "ok" }` (o el error correspondiente si la DB no responde).
- CORS configurado para aceptar el origen del frontend (local primero, se agrega el dominio de Netlify al desplegar).
- `requirements.txt` con: `fastapi`, `uvicorn`, `sqlalchemy`, `psycopg2-binary`, `alembic`, `python-dotenv`, `pydantic-settings`.

## Frontend (`frontend/`)

- React + Vite.
- `react-router-dom` instalado (preparando las rutas de specs futuros: `/`, `/home`, `/card`, `/transactions`).
- Una sola pantalla por ahora: botón **"Test connection"**.
  - Al hacerlo, llama a `GET {VITE_API_URL}/health`.
  - Si responde `status: ok` y `db: ok` → muestra un **toast de éxito**.
  - Si falla (red o DB) → muestra un toast de error con el motivo.
- `.env` con `VITE_API_URL` (apunta a `http://localhost:8000` en local).

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
