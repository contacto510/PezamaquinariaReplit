#!/usr/bin/env bash
# Refresca la base de datos de DESARROLLO con una copia de los datos reales
# de producción (Neon). Solo LEE de producción (pg_dump) y sobrescribe la
# base de desarrollo (DATABASE_URL).
#
# Uso:  bash scripts/refresh-dev-db.sh
#
# Seguridad:
# - NEON_DATABASE_URL solo se usa con pg_dump (lectura).
# - DATABASE_URL (dev) se sobrescribe por completo: se elimina el schema
#   public y se restaura desde el dump. NUNCA apuntes DATABASE_URL a
#   producción antes de correr este script.

set -euo pipefail

: "${NEON_DATABASE_URL:?Falta NEON_DATABASE_URL (producción, solo lectura)}"
: "${DATABASE_URL:?Falta DATABASE_URL (desarrollo, destino a sobrescribir)}"

if [ "$NEON_DATABASE_URL" = "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL apunta a la misma base que NEON_DATABASE_URL (producción)." >&2
  echo "Abortando para no sobrescribir producción." >&2
  exit 1
fi

DUMP_FILE="$(mktemp /tmp/prod-dump-XXXXXX.sql)"
trap 'rm -f "$DUMP_FILE"' EXIT

echo "1/3 Exportando datos de producción (solo lectura)..."
pg_dump "$NEON_DATABASE_URL" \
  --no-owner --no-privileges \
  --format=plain \
  --file="$DUMP_FILE"

echo "2/3 Limpiando base de desarrollo..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

echo "3/3 Restaurando copia en desarrollo..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$DUMP_FILE" > /dev/null

echo "Listo. Verificación rápida:"
psql "$DATABASE_URL" -t -c "SELECT count(*) AS reparaciones, max(repair_number) AS folio_max FROM repairs;"
