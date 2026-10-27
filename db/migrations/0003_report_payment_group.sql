-- Cambio aditivo autorizado: no agrupa ni modifica movimientos históricos.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE report_payments ADD COLUMN IF NOT EXISTS payment_group_id text;
COMMIT;
