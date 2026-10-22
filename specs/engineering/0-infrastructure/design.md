# Spec 0 — Design

## 0. Postgres local

Para este MVP se usa directo el superusuario `postgres` (creado al instalar Postgres) contra una base de datos `acme_app` creada manualmente desde pgAdmin — sin crear un role de aplicación aparte, para mantenerlo simple en desarrollo local.

```
postgresql://postgres:TU_PASSWORD@localhost:5432/acme_app
```

Postgres local corre en el puerto default (5432), instalación detectada en `/Library/PostgreSQL/18`.

## 1. Backend

### Entorno

- Python 3.9.6 (el del sistema, `/usr/bin/python3`) — funciona bien con FastAPI/SQLAlchemy, no hace falta instalar otro.
- Virtualenv: `python3 -m venv venv` dentro de `backend/`.

### `requirements.txt`

```
fastapi
uvicorn[standard]
sqlalchemy
psycopg2-binary
python-dotenv
pydantic-settings
```

### `app/core/config.py`

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    cors_origins: list[str] = ["http://localhost:5173"]

    class Config:
        env_file = ".env"

settings = Settings()
```

### `app/db/base.py`

```python
from sqlalchemy.orm import declarative_base

Base = declarative_base()
```

### `app/db/session.py`

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### `app/main.py`

```python
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.session import get_db

app = FastAPI(title="Acme Credit API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "db": "ok"}
    except Exception as e:
        return {"status": "ok", "db": "error", "detail": str(e)}
```

### `.env.example` (backend)

```
DATABASE_URL=postgresql+psycopg2://postgres:CHANGE_ME@localhost:5432/acme_app
CORS_ORIGINS=["http://localhost:5173","http://localhost:5174"]
```

El driver `+psycopg2` es explícito a propósito (ver `worklog.md` — sin esto, SQLAlchemy 2.1+ intenta usar `psycopg` v3 por default y rompe en entornos donde solo está instalado `psycopg2-binary`, como Render).

## 2. Frontend

### Scaffold

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install react-router-dom zod react-hook-form @hookform/resolvers zustand @tanstack/react-query date-fns lucide-react sonner
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
npx shadcn@latest init   # configurar components.json → src/common/components/ui
```

### `src/api/client.ts`

```typescript
const API_URL = import.meta.env.VITE_API_URL;

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

### `src/App.tsx`

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AppRouter } from "./router";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
      <Toaster />
    </QueryClientProvider>
  );
}
```

### `src/router.tsx`

Para este spec, una sola ruta temporal (`/`) con la pantalla de prueba. Se reemplaza por las rutas reales en los Specs 4-7.

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TestConnectionPage } from "./pages/TestConnectionPage";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TestConnectionPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### `src/pages/TestConnectionPage.tsx`

```tsx
import { toast } from "sonner";
import { apiFetch } from "../api/client";

export function TestConnectionPage() {
  async function handleTest() {
    try {
      const res = await apiFetch<{ status: string; db: string }>("/health");
      if (res.status === "ok" && res.db === "ok") {
        toast.success("Connection OK: backend + DB reachable");
      } else {
        toast.error(`DB issue: ${JSON.stringify(res)}`);
      }
    } catch (e) {
      toast.error(`Connection failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <button
        onClick={handleTest}
        className="rounded bg-primary px-4 py-2 text-primary-foreground"
      >
        Test connection
      </button>
    </div>
  );
}
```

### `.env.example` (frontend)

```
VITE_API_URL=http://localhost:8000
```

## 3. Script de desarrollo local — `scripts/dev.sh`

```bash
#!/bin/bash
set -e
(cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8000) &
(cd frontend && npm run dev -- --port 5173) &
wait
```

## 4. Deploy

### `frontend/netlify.toml`

```toml
[build]
  command = "npm run build"
  publish = "dist"
```
(Netlify UI: Base directory = `frontend/`.)

### Render

Sin archivo de config — se configura directo en el dashboard (Root directory `backend/`, build/start command, env var `DATABASE_URL`), tal como ya está en `requirements.md`.

### Supabase

Sin archivo de config — solo se usa la connection string para correr los scripts del Spec 1 manualmente.
