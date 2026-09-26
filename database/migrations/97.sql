-- #567 — NF-e cancelada permanece como trilha, sem efeito fiscal.

ALTER TABLE public.lancamentos_fiscais
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ativa',
  ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT,
  ADD COLUMN IF NOT EXISTS protocolo_cancelamento TEXT;

ALTER TABLE public.lancamentos_fiscais
  DROP CONSTRAINT IF EXISTS lancamentos_fiscais_status_check;

ALTER TABLE public.lancamentos_fiscais
  ADD CONSTRAINT lancamentos_fiscais_status_check
  CHECK (status IN ('ativa', 'cancelada'));

CREATE INDEX IF NOT EXISTS idx_lancamentos_fiscais_cliente_status_data
  ON public.lancamentos_fiscais (cliente_id, status, data_emissao);

-- Rollback:
-- DROP INDEX IF EXISTS public.idx_lancamentos_fiscais_cliente_status_data;
-- ALTER TABLE public.lancamentos_fiscais DROP CONSTRAINT IF EXISTS lancamentos_fiscais_status_check;
-- ALTER TABLE public.lancamentos_fiscais
--   DROP COLUMN IF EXISTS protocolo_cancelamento,
--   DROP COLUMN IF EXISTS motivo_cancelamento,
--   DROP COLUMN IF EXISTS cancelado_em,
--   DROP COLUMN IF EXISTS status;
