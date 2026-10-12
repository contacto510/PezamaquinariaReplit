ALTER TABLE public.repairs
  ADD COLUMN IF NOT EXISTS review_amount numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_only boolean NOT NULL DEFAULT false;
