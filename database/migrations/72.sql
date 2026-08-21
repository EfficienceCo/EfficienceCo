-- Dados tributários do cliente usados pelo motor de apuração (AP-2 / #351).
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS regime_tributario TEXT;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS cnae TEXT;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS anexo_simples TEXT
    CHECK (anexo_simples IN ('I', 'II', 'III', 'IV', 'V'));

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS historico_receita JSONB DEFAULT '[]'::jsonb;
