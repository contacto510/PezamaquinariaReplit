---
name: Dev vs prod database
description: Dev DATABASE_URL is a stale copy; real user data lives in NEON_DATABASE_URL
---
The app connects via `DATABASE_URL` (db/index.ts). In the workspace, `DATABASE_URL` points to a development Postgres that is a **stale copy** of the real data. The published app's live data is in the Neon database (`NEON_DATABASE_URL`).

**Why:** Answering data questions ("does repair R-812 exist?") from the dev API/DB gave wrong answers — prod had 208 repairs (max R-812) while dev had 175 (max R-779).

**How to apply:** For any question about the user's real data (folios, counts, balances, client links), query `psql "$NEON_DATABASE_URL"` read-only — never trust the dev API or `$DATABASE_URL` for data facts. Never write to Neon from dev without explicit user consent.

To refresh the dev copy from prod, run `bash scripts/refresh-dev-db.sh` (pg_dump from Neon read-only, drops/restores dev's public schema; aborts if both URLs match). Documented in replit.md. The dev copy goes stale again over time — refresh before verifying data.

Comparaciones de fechas entre el driver de la aplicación y scripts con `pg`: los timestamps sin zona no se interpretan igual. La aplicación los materializa como UTC; `pg` puede interpretarlos en la zona local del proceso.

**Why:** Una comprobación de solo lectura produjo diferencias de un día en recepción y antigüedad pese a consultar los mismos registros.

**How to apply:** En comprobaciones directas, proyectar explícitamente los timestamps sin zona con `AT TIME ZONE 'UTC'` antes de compararlos con la respuesta de la aplicación. No corregir las fechas almacenadas ni cambiar su significado de negocio para hacer coincidir dos parsers.
