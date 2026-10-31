-- 105 / QA-E / E396-P1-09: cliente_id do item fiscal deve corresponder ao pai.
-- O Dev só escreve; o Gerente aplica no Supabase local após revisão.
-- Não altera histórico: inconsistências existentes interrompem a migration.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.lancamentos_fiscais_itens item
    LEFT JOIN public.lancamentos_fiscais nota ON nota.id = item.lancamento_id
    WHERE nota.id IS NULL OR nota.cliente_id IS DISTINCT FROM item.cliente_id
  ) THEN
    RAISE EXCEPTION '105: itens fiscais com cliente_id diferente do lançamento; revisar os dados antes de aplicar';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lancamentos_fiscais'::regclass
      AND conname = 'lancamentos_fiscais_id_cliente_key'
  ) THEN
    ALTER TABLE public.lancamentos_fiscais
      ADD CONSTRAINT lancamentos_fiscais_id_cliente_key UNIQUE (id, cliente_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lancamentos_fiscais_itens'::regclass
      AND conname = 'lancamentos_fiscais_itens_lancamento_cliente_fkey'
  ) THEN
    ALTER TABLE public.lancamentos_fiscais_itens
      ADD CONSTRAINT lancamentos_fiscais_itens_lancamento_cliente_fkey
      FOREIGN KEY (lancamento_id, cliente_id)
      REFERENCES public.lancamentos_fiscais (id, cliente_id) ON DELETE CASCADE;
  END IF;
END $$;

-- Mantém uma única relação PostgREST entre pai e itens, sem embed ambíguo.
ALTER TABLE public.lancamentos_fiscais_itens
  DROP CONSTRAINT IF EXISTS lancamentos_fiscais_itens_lancamento_id_fkey;

COMMIT;

-- Rollback (em transação, sem apagar dados):
-- BEGIN;
-- ALTER TABLE public.lancamentos_fiscais_itens
--   ADD CONSTRAINT lancamentos_fiscais_itens_lancamento_id_fkey
--   FOREIGN KEY (lancamento_id) REFERENCES public.lancamentos_fiscais(id) ON DELETE CASCADE;
-- ALTER TABLE public.lancamentos_fiscais_itens
--   DROP CONSTRAINT IF EXISTS lancamentos_fiscais_itens_lancamento_cliente_fkey;
-- ALTER TABLE public.lancamentos_fiscais
--   DROP CONSTRAINT IF EXISTS lancamentos_fiscais_id_cliente_key;
-- COMMIT;
