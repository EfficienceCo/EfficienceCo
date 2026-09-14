-- BUG-FOLHA-06 (#442) - protege dados sensiveis da folha com RLS.
-- O backend acessa estas tabelas exclusivamente com service_role; nao existe
-- acesso direto para anon ou authenticated.
ALTER TABLE public.processamentos_folha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folha_calculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folha_relatorios ENABLE ROW LEVEL SECURITY;

-- Limpa policies de negacao de uma versao preliminar que pode ter sido
-- aplicada manualmente no dev. Sob RLS, a ausencia de policy positiva ja
-- bloqueia essas roles e evita manter policies diretas desnecessarias.
DROP POLICY IF EXISTS processamentos_folha_no_anon ON public.processamentos_folha;
DROP POLICY IF EXISTS folha_calculos_no_anon ON public.folha_calculos;
DROP POLICY IF EXISTS folha_relatorios_no_anon ON public.folha_relatorios;
DROP POLICY IF EXISTS processamentos_folha_no_authenticated ON public.processamentos_folha;
DROP POLICY IF EXISTS folha_calculos_no_authenticated ON public.folha_calculos;
DROP POLICY IF EXISTS folha_relatorios_no_authenticated ON public.folha_relatorios;

-- Reaplicavel, inclusive depois de uma execucao parcial, no mesmo formato da
-- migration 84 (certificados_digitais).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.processamentos_folha'::regclass
      AND polname = 'processamentos_folha_service_role'
  ) THEN
    CREATE POLICY processamentos_folha_service_role
      ON public.processamentos_folha
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.folha_calculos'::regclass
      AND polname = 'folha_calculos_service_role'
  ) THEN
    CREATE POLICY folha_calculos_service_role
      ON public.folha_calculos
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.folha_relatorios'::regclass
      AND polname = 'folha_relatorios_service_role'
  ) THEN
    CREATE POLICY folha_relatorios_service_role
      ON public.folha_relatorios
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

-- Rollback controlado (reabre acesso direto e, por isso, exige aprovacao):
-- DROP POLICY IF EXISTS processamentos_folha_service_role ON public.processamentos_folha;
-- DROP POLICY IF EXISTS folha_calculos_service_role ON public.folha_calculos;
-- DROP POLICY IF EXISTS folha_relatorios_service_role ON public.folha_relatorios;
-- ALTER TABLE public.processamentos_folha DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.folha_calculos DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.folha_relatorios DISABLE ROW LEVEL SECURITY;
