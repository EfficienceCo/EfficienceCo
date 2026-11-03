\set ON_ERROR_STOP on

-- Regressão do replay 50 -> 51 -> 52 (#678).
-- Executar em PostgreSQL descartável:
--   psql <URL_LOCAL_DO_TESTE> -f database/tests/50-obrigacoes-notificacoes-pk-replay.sql
-- As tabelas temporárias reproduzem as chaves de 21.sql/23.sql e desaparecem
-- ao fechar a conexão, inclusive se alguma migration falhar.

CREATE TEMP TABLE obrigacoes (
  id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  data_vencimento date NOT NULL,
  recorrente boolean,
  status text,
  criado_em timestamptz,
  CONSTRAINT pk_obrigacoes PRIMARY KEY (id, cliente_id)
);

CREATE TEMP TABLE notificacoes (
  id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  criado_em timestamptz,
  lida boolean,
  CONSTRAINT pk_notificacoes PRIMARY KEY (id, cliente_id)
);

INSERT INTO obrigacoes (id, cliente_id, data_vencimento, status)
VALUES ('00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000010', '2026-10-30', 'pendente');
INSERT INTO notificacoes (id, cliente_id, lida)
VALUES ('00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000010', true);

\ir ../migrations/50.sql
\ir ../migrations/51.sql
\ir ../migrations/52.sql

-- Reaplicar a sequência também deve funcionar com as chaves já convertidas.
\ir ../migrations/50.sql
\ir ../migrations/51.sql
\ir ../migrations/52.sql

DO $$
DECLARE
  tabela text;
  quantidade integer;
  nome_chave text;
  definicao text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['obrigacoes', 'notificacoes'] LOOP
    SELECT count(*) INTO quantidade
    FROM pg_constraint
    WHERE conrelid = format('pg_temp.%I', tabela)::regclass AND contype = 'p';
    IF quantidade <> 1 THEN
      RAISE EXCEPTION '% deve ter exatamente uma chave primária', tabela;
    END IF;

    SELECT conname, pg_get_constraintdef(oid) INTO nome_chave, definicao
    FROM pg_constraint
    WHERE conrelid = format('pg_temp.%I', tabela)::regclass AND contype = 'p';
    IF nome_chave IS DISTINCT FROM 'pk_' || tabela
       OR definicao IS DISTINCT FROM 'PRIMARY KEY (id)' THEN
      RAISE EXCEPTION 'Chave inesperada em %: % / %', tabela, nome_chave, definicao;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM pg_temp.obrigacoes) <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_temp.obrigacoes WHERE status = 'pendente' AND data_vencimento = DATE '2026-10-30')
     OR (SELECT count(*) FROM pg_temp.notificacoes) <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_temp.notificacoes WHERE lida) THEN
    RAISE EXCEPTION 'Registros anteriores foram alterados ou removidos';
  END IF;

  BEGIN
    INSERT INTO pg_temp.obrigacoes (id, cliente_id, data_vencimento)
    VALUES ('00000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-000000000020', '2026-10-31');
    RAISE EXCEPTION 'Obrigação aceitou id duplicado em outro cliente';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO pg_temp.notificacoes (id, cliente_id)
    VALUES ('00000000-0000-0000-0000-000000000002',
            '00000000-0000-0000-0000-000000000020');
    RAISE EXCEPTION 'Notificação aceitou id duplicado em outro cliente';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;

SELECT 'OK: sequência 50/51/52, registros e unicidade por id preservados' AS resultado;
