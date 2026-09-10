-- BUG-NFE-02 (#447) — idempotência de NF-e por tenant.
-- Troca UNIQUE global em chave_nfe por UNIQUE(cliente_id, chave_nfe),
-- permitindo a mesma chave em clientes distintos (cada um com sua licença).
-- 89.sql reservado para BUG-NFE-05 (#450) — limpeza de arquivo_xml absolutos.

-- Remove UNIQUE só em chave_nfe, qualquer que seja o nome da constraint
-- (coluna UNIQUE → …_chave_nfe_key; ou nome custom / índice único).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'lancamentos_fiscais'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ~* 'chave_nfe'
      AND pg_get_constraintdef(c.oid) !~* 'cliente_id'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.lancamentos_fiscais DROP CONSTRAINT IF EXISTS %I',
      r.conname
    );
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.lancamentos_fiscais_chave_nfe_key;
DROP INDEX IF EXISTS public.lancamentos_fiscais_chave_nfe_idx;

ALTER TABLE public.lancamentos_fiscais
  DROP CONSTRAINT IF EXISTS lancamentos_fiscais_cliente_chave_nfe_key;

ALTER TABLE public.lancamentos_fiscais
  ADD CONSTRAINT lancamentos_fiscais_cliente_chave_nfe_key
  UNIQUE (cliente_id, chave_nfe);
