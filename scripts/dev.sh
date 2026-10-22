#!/bin/bash
set -e
cd "$(dirname "$0")/.."

(cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8000) &
(cd frontend && npm run dev -- --port 5173) &
wait
