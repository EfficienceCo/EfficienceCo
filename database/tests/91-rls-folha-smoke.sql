\set ON_ERROR_STOP on

-- BUG-FOLHA-06 (#442)
-- Execute com uma role administrativa em um banco de desenvolvimento:
--   psql "<DATABASE_URL_ADMIN_DEV>" -f database/tests/91-rls-folha-smoke.sql
--
-- Toda a verificacao, inclusive as duas aplicacoes da migration, e revertida.
BEGIN;

-- Replay: a segunda aplicacao precisa terminar sem erro nem policy duplicada.
\ir ../migrations/91.sql
\ir ../migrations/91.sql

DO $$
DECLARE
  tabela text;
  total_policies integer;
  total_service_role integer;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'processamentos_folha',
    'folha_calculos',
    'folha_relatorios'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = tabela
        AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS nao esta habilitada em public.%', tabela;
    END IF;

    SELECT count(*)
      INTO total_policies
    FROM pg_policy
    WHERE polrelid = format('public.%I', tabela)::regclass;

    SELECT count(*)
      INTO total_service_role
    FROM pg_policy
    WHERE polrelid = format('public.%I', tabela)::regclass
      AND polname = tabela || '_service_role'
      AND polcmd = '*'
      AND polroles = ARRAY['service_role'::regrole::oid]
      AND pg_get_expr(polqual, polrelid) = 'true'
      AND pg_get_expr(polwithcheck, polrelid) = 'true';

    IF total_policies <> 1 OR total_service_role <> 1 THEN
      RAISE EXCEPTION
        'public.% deveria ter somente a policy FOR ALL de service_role (policies=%, validas=%)',
        tabela,
        total_policies,
        total_service_role;
    END IF;
  END LOOP;
END;
$$;

SELECT gen_random_uuid() AS qa_cliente_id, gen_random_uuid() AS qa_processamento_id,
       gen_random_uuid() AS qa_calculo_id, gen_random_uuid() AS qa_relatorio_id
\gset

-- DO blocks nao expandem variaveis do psql dentro de dollar quotes. GUCs
-- locais mantem os UUIDs aleatorios disponiveis sem escapar da transacao.
SELECT set_config('qa.processamento_id', :'qa_processamento_id', true),
       set_config('qa.calculo_id', :'qa_calculo_id', true),
       set_config('qa.relatorio_id', :'qa_relatorio_id', true);

-- A fixture-pai e criada pela role administrativa porque clientes nao faz
-- parte do escopo desta migration.
INSERT INTO public.clientes (id, nome)
VALUES (:'qa_cliente_id', 'QA temporario RLS folha');

-- Mesmo papel usado pelo SUPABASE_SERVICE_KEY do backend.
SET LOCAL ROLE service_role;

INSERT INTO public.processamentos_folha (
  id,
  cliente_id,
  mes_referencia,
  status,
  arquivo_origem_path
) VALUES (
  :'qa_processamento_id',
  :'qa_cliente_id',
  DATE '2099-01-01',
  'pendente',
  'qa/entrada.xlsx'
);

INSERT INTO public.folha_calculos (
  id,
  processamento_id,
  empresa,
  funcionario,
  cpf,
  cargo,
  salario_bruto,
  dias_trabalhados,
  horas_extras,
  faltas,
  adiantamento,
  num_dependentes,
  vale_transporte,
  valor_horas_extras,
  valor_faltas,
  desconto_vt,
  base_calculo,
  inss,
  fgts,
  ir,
  liquido
) VALUES (
  :'qa_calculo_id',
  :'qa_processamento_id',
  'QA Empresa',
  'QA Funcionario',
  '00000000000',
  'QA',
  1000.00,
  30,
  0,
  0,
  0,
  0,
  false,
  0,
  0,
  0,
  1000.00,
  0,
  80.00,
  0,
  1000.00
);

INSERT INTO public.folha_relatorios (
  id,
  processamento_id,
  empresa,
  total_funcionarios,
  total_bruto,
  total_encargos,
  total_liquido,
  arquivo_path
) VALUES (
  :'qa_relatorio_id',
  :'qa_processamento_id',
  'QA Empresa',
  1,
  1000.00,
  80.00,
  1000.00,
  'qa/relatorio.pdf'
);

UPDATE public.processamentos_folha
SET status = 'processando'
WHERE id = :'qa_processamento_id';

-- Falha por divisao por zero se qualquer leitura do service_role nao enxergar
-- exatamente a fixture que acabou de escrever.
SELECT 1 / (
  (
    (SELECT count(*) FROM public.processamentos_folha WHERE id = :'qa_processamento_id') = 1
    AND (SELECT count(*) FROM public.folha_calculos WHERE id = :'qa_calculo_id') = 1
    AND (SELECT count(*) FROM public.folha_relatorios WHERE id = :'qa_relatorio_id') = 1
  )::integer
);

RESET ROLE;

-- Para cada papel direto, leitura deve retornar zero linhas (ou permission
-- denied) e escrita deve afetar zero linhas (ou permission denied).
SET LOCAL ROLE anon;
DO $$
DECLARE
  tabela text;
  coluna_id text;
  fixture_id uuid;
  visiveis bigint;
  alteradas bigint;
BEGIN
  FOR tabela, coluna_id, fixture_id IN
    VALUES
      ('processamentos_folha', 'id', current_setting('qa.processamento_id')::uuid),
      ('folha_calculos', 'id', current_setting('qa.calculo_id')::uuid),
      ('folha_relatorios', 'id', current_setting('qa.relatorio_id')::uuid)
  LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', tabela, coluna_id)
        INTO visiveis
        USING fixture_id;
    EXCEPTION WHEN insufficient_privilege THEN
      visiveis := 0;
    END;

    BEGIN
      EXECUTE format(
        'UPDATE public.%I SET criado_em = criado_em WHERE %I = $1',
        tabela,
        coluna_id
      ) USING fixture_id;
      GET DIAGNOSTICS alteradas = ROW_COUNT;
    EXCEPTION WHEN insufficient_privilege THEN
      alteradas := 0;
    END;

    IF visiveis <> 0 OR alteradas <> 0 THEN
      RAISE EXCEPTION 'anon acessou public.% (visiveis=%, alteradas=%)',
        tabela,
        visiveis,
        alteradas;
    END IF;
  END LOOP;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  tabela text;
  coluna_id text;
  fixture_id uuid;
  visiveis bigint;
  alteradas bigint;
BEGIN
  FOR tabela, coluna_id, fixture_id IN
    VALUES
      ('processamentos_folha', 'id', current_setting('qa.processamento_id')::uuid),
      ('folha_calculos', 'id', current_setting('qa.calculo_id')::uuid),
      ('folha_relatorios', 'id', current_setting('qa.relatorio_id')::uuid)
  LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', tabela, coluna_id)
        INTO visiveis
        USING fixture_id;
    EXCEPTION WHEN insufficient_privilege THEN
      visiveis := 0;
    END;

    BEGIN
      EXECUTE format(
        'UPDATE public.%I SET criado_em = criado_em WHERE %I = $1',
        tabela,
        coluna_id
      ) USING fixture_id;
      GET DIAGNOSTICS alteradas = ROW_COUNT;
    EXCEPTION WHEN insufficient_privilege THEN
      alteradas := 0;
    END;

    IF visiveis <> 0 OR alteradas <> 0 THEN
      RAISE EXCEPTION 'authenticated acessou public.% (visiveis=%, alteradas=%)',
        tabela,
        visiveis,
        alteradas;
    END IF;
  END LOOP;
END;
$$;
RESET ROLE;

ROLLBACK;
