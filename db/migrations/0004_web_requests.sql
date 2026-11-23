CREATE TABLE IF NOT EXISTS web_requests (
  id serial PRIMARY KEY,
  submission_id text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('cotizacion_renta', 'reparacion')),
  status text NOT NULL DEFAULT 'nueva' CHECK (status IN ('nueva','seguimiento','convertida','descartada')),
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  converted_id integer,
  converted_folio text,
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS web_requests_received_idx ON web_requests (received_at DESC);
