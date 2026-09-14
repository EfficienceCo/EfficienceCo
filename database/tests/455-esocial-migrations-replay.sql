\set ON_ERROR_STOP on

-- BUG-ESOCIAL-05 (#455) + QA-cleanup-2 (#404)
-- Execute com uma role administrativa em um banco de desenvolvimento:
--   psql "<DATABASE_URL_ADMIN_DEV>" -f database/tests/455-esocial-migrations-replay.sql
--
-- O teste reaplica duas vezes as migrations pendentes/corretivas, valida o
-- schema final e executa o UPDATE que a trigger antiga quebrava. Toda a
-- verificacao roda em uma unica transacao e termina com ROLLBACK.
BEGIN;

\ir ../migrations/72.sql
\ir ../migrations/79.sql
\ir ../migrations/80.sql
\ir ../migrations/81.sql
\ir ../migrations/82.sql
\ir ../migrations/85.sql

\ir ../migrations/72.sql
\ir ../migrations/79.sql
\ir ../migrations/80.sql
\ir ../migrations/81.sql
\ir ../migrations/82.sql
\ir ../migrations/85.sql

DO $$
DECLARE
  total_check_esocial_status integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.regras'::regclass
      AND attname = 'versao'
      AND NOT attisdropped
      AND attnotnull
  ) THEN
    RAISE EXCEPTION 'public.regras.versao deveria ser NOT NULL (72.sql)';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.processamentos_folha'::regclass
      AND attname = 'esocial_status'
      AND NOT attisdropped
      AND format_type(atttypid, atttypmod) = 'text'
  ) THEN
    RAISE EXCEPTION 'public.processamentos_folha.esocial_status ausente ou com tipo incorreto';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.processamentos_folha'::regclass
      AND attname = 'esocial_fechado_em'
      AND NOT attisdropped
      AND format_type(atttypid, atttypmod) = 'timestamp with time zone'
  ) THEN
    RAISE EXCEPTION 'public.processamentos_folha.esocial_fechado_em ausente ou com tipo incorreto';
  END IF;

  IF (
    SELECT pg_get_expr(d.adbin, d.adrelid)
    FROM pg_attribute a
    JOIN pg_attrdef d
      ON d.adrelid = a.attrelid
     AND d.adnum = a.attnum
    WHERE a.attrelid = 'public.processamentos_folha'::regclass
      AND a.attname = 'esocial_status'
      AND NOT a.attisdropped
  ) IS DISTINCT FROM '''nao_iniciado''::text' THEN
    RAISE EXCEPTION 'DEFAULT de esocial_status deveria ser nao_iniciado';
  END IF;

  SELECT count(*)
    INTO total_check_esocial_status
  FROM pg_constraint
  WHERE conrelid = 'public.processamentos_folha'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%esocial_status%'
    AND pg_get_constraintdef(oid) LIKE '%nao_iniciado%'
    AND pg_get_constraintdef(oid) LIKE '%s1200_enviado%'
    AND pg_get_constraintdef(oid) LIKE '%s1210_enviado%'
    AND pg_get_constraintdef(oid) LIKE '%fechado%';

  IF total_check_esocial_status <> 1 THEN
    RAISE EXCEPTION 'Esperada uma CHECK de esocial_status, encontradas %',
      total_check_esocial_status;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.eventos_esocial'::regclass
      AND attname = 'dados_formulario'
      AND NOT attisdropped
      AND format_type(atttypid, atttypmod) = 'jsonb'
  ) THEN
    RAISE EXCEPTION 'public.eventos_esocial.dados_formulario ausente ou com tipo incorreto';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.clientes'::regclass
      AND attname = 'esocial_configurado'
      AND NOT attisdropped
      AND format_type(atttypid, atttypmod) = 'boolean'
      AND attnotnull
  ) THEN
    RAISE EXCEPTION 'public.clientes.esocial_configurado deveria ser BOOLEAN NOT NULL';
  END IF;

  IF (
    SELECT pg_get_expr(d.adbin, d.adrelid)
    FROM pg_attribute a
    JOIN pg_attrdef d
      ON d.adrelid = a.attrelid
     AND d.adnum = a.attnum
    WHERE a.attrelid = 'public.clientes'::regclass
      AND a.attname = 'esocial_configurado'
      AND NOT a.attisdropped
  ) IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'DEFAULT de clientes.esocial_configurado deveria ser false';
  END IF;

  IF to_regclass('public.idx_eventos_esocial_cliente_criado') IS NULL THEN
    RAISE EXCEPTION 'Indice idx_eventos_esocial_cliente_criado ausente';
  END IF;

  IF to_regclass('public.idx_eventos_esocial_funcionario') IS NULL THEN
    RAISE EXCEPTION 'Indice idx_eventos_esocial_funcionario ausente';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.eventos_esocial'::regclass
      AND tgname = 'trigger_atualiza_esocial_fechado'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Trigger legada trigger_atualiza_esocial_fechado ainda existe';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'trg_set_esocial_fechado_em'
  ) THEN
    RAISE EXCEPTION 'Funcao legada trg_set_esocial_fechado_em ainda existe';
  END IF;
END;
$$;

SELECT gen_random_uuid() AS qa_cliente_id, gen_random_uuid() AS qa_evento_id
\gset

INSERT INTO public.clientes (id, nome, esocial_configurado)
VALUES (:'qa_cliente_id', 'QA temporario migrations eSocial', true);

INSERT INTO public.eventos_esocial (
  id,
  cliente_id,
  tipo_evento,
  dados_formulario,
  status
) VALUES (
  :'qa_evento_id',
  :'qa_cliente_id',
  'S-2200',
  '{"qa": true}'::jsonb,
  'rascunho'
);

-- Este UPDATE disparava a trigger quebrada da antiga 81.sql e retornava 500
-- no backend. Agora ele precisa alterar exatamente uma linha sem erro.
UPDATE public.eventos_esocial
SET status = 'aprovado'
WHERE id = :'qa_evento_id';

SELECT 1 / (
  (
    SELECT count(*) = 1
    FROM public.eventos_esocial
    WHERE id = :'qa_evento_id'
      AND status = 'aprovado'
  )::integer
);

ROLLBACK;
