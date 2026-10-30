-- #663 / NFE-9 — CFOP e NCM por item + alerta de inconsistência.
-- Spec: efficience-vault/decisoes/2026-10-24-nfe-9-cfop-ncm.md
-- Vinícius aplica no Supabase de dev (banco em modo manutenção).

ALTER TABLE public.lancamentos_fiscais
  ADD COLUMN IF NOT EXISTS tp_nf SMALLINT,
  ADD COLUMN IF NOT EXISTS inconsistencias JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.lancamentos_fiscais
  DROP CONSTRAINT IF EXISTS lancamentos_fiscais_tp_nf_check;

ALTER TABLE public.lancamentos_fiscais
  ADD CONSTRAINT lancamentos_fiscais_tp_nf_check
  CHECK (tp_nf IS NULL OR tp_nf IN (0, 1));

CREATE TABLE IF NOT EXISTS public.lancamentos_fiscais_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id UUID NOT NULL REFERENCES public.lancamentos_fiscais(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  n_item INTEGER NOT NULL,
  cfop VARCHAR(4) NOT NULL,
  ncm VARCHAR(8) NOT NULL,
  CONSTRAINT lancamentos_fiscais_itens_n_item_check CHECK (n_item >= 1),
  CONSTRAINT lancamentos_fiscais_itens_cfop_check CHECK (cfop ~ '^[0-9]{4}$'),
  CONSTRAINT lancamentos_fiscais_itens_ncm_check CHECK (ncm ~ '^[0-9]{8}$'),
  CONSTRAINT lancamentos_fiscais_itens_lancamento_n_item_key UNIQUE (lancamento_id, n_item)
);

CREATE INDEX IF NOT EXISTS idx_lancamentos_fiscais_itens_lancamento
  ON public.lancamentos_fiscais_itens (lancamento_id);

CREATE INDEX IF NOT EXISTS idx_lancamentos_fiscais_itens_cliente
  ON public.lancamentos_fiscais_itens (cliente_id);

ALTER TABLE public.lancamentos_fiscais_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura de itens fiscais por cliente autenticado"
  ON public.lancamentos_fiscais_itens;
CREATE POLICY "Leitura de itens fiscais por cliente autenticado"
ON public.lancamentos_fiscais_itens
FOR SELECT
TO authenticated
USING (cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Insercao de itens fiscais por cliente autenticado"
  ON public.lancamentos_fiscais_itens;
CREATE POLICY "Insercao de itens fiscais por cliente autenticado"
ON public.lancamentos_fiscais_itens
FOR INSERT
TO authenticated
WITH CHECK (cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Atualizacao de itens fiscais por cliente autenticado"
  ON public.lancamentos_fiscais_itens;
CREATE POLICY "Atualizacao de itens fiscais por cliente autenticado"
ON public.lancamentos_fiscais_itens
FOR UPDATE
TO authenticated
USING (cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid()))
WITH CHECK (cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Exclusao de itens fiscais por cliente autenticado"
  ON public.lancamentos_fiscais_itens;
CREATE POLICY "Exclusao de itens fiscais por cliente autenticado"
ON public.lancamentos_fiscais_itens
FOR DELETE
TO authenticated
USING (cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Sem leitura direta anon itens fiscais"
  ON public.lancamentos_fiscais_itens;
CREATE POLICY "Sem leitura direta anon itens fiscais"
ON public.lancamentos_fiscais_itens
FOR SELECT
TO anon
USING (false);

DROP POLICY IF EXISTS "Acesso total service_role itens fiscais"
  ON public.lancamentos_fiscais_itens;
CREATE POLICY "Acesso total service_role itens fiscais"
ON public.lancamentos_fiscais_itens
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Rollback:
-- DROP TABLE IF EXISTS public.lancamentos_fiscais_itens;
-- ALTER TABLE public.lancamentos_fiscais DROP CONSTRAINT IF EXISTS lancamentos_fiscais_tp_nf_check;
-- ALTER TABLE public.lancamentos_fiscais DROP COLUMN IF EXISTS inconsistencias, DROP COLUMN IF EXISTS tp_nf;
