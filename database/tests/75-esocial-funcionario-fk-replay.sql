\set ON_ERROR_STOP on

-- Regressão do replay 75 -> 76 (#678). Executar no Supabase local descartável
-- (a role service_role usada pelas migrations deve existir):
--   psql <URL_LOCAL_DO_TESTE> -f database/tests/75-esocial-funcionario-fk-replay.sql
-- O search_path explícito faz os CREATE TABLE das migrations usarem o schema
-- temporário desta conexão; nenhuma tabela da aplicação é alterada.
CREATE TEMP TABLE clientes (id uuid PRIMARY KEY);
SET search_path = pg_temp;

\ir ../migrations/75.sql
\ir ../migrations/76.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'pg_temp.eventos_esocial'::regclass AND relpersistence = 't'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'pg_temp.funcionarios'::regclass AND relpersistence = 't'
  ) THEN
    RAISE EXCEPTION 'O replay deve ficar restrito às tabelas temporárias';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute origem
      ON origem.attrelid = c.conrelid AND c.conkey = ARRAY[origem.attnum]
    JOIN pg_attribute destino
      ON destino.attrelid = c.confrelid AND c.confkey = ARRAY[destino.attnum]
    WHERE c.conrelid = 'pg_temp.eventos_esocial'::regclass
      AND c.confrelid = 'pg_temp.funcionarios'::regclass
      AND c.contype = 'f'
      AND c.conname = 'eventos_esocial_funcionario_id_fkey'
      AND c.convalidated
      AND c.confdeltype = 'a' AND c.confupdtype = 'a'
      AND NOT c.condeferrable
      AND origem.attname = 'funcionario_id' AND destino.attname = 'id'
  ) THEN
    RAISE EXCEPTION 'Falta a FK validada eventos_esocial.funcionario_id -> funcionarios.id';
  END IF;
END $$;

SELECT 'OK: sequência 75/76 cria as tabelas e mantém a referência ao funcionário' AS resultado;
