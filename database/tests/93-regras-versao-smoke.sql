-- Somente em banco DESCARTÁVEL vazio (cria fixtures em public; ROLLBACK ao final).
-- psql -X -v ON_ERROR_STOP=1 -f database/tests/93-regras-versao-smoke.sql
BEGIN;
CREATE TABLE public.clientes (id uuid PRIMARY KEY);
CREATE TABLE public.regras (
  id int PRIMARY KEY, cliente_id uuid REFERENCES public.clientes ON DELETE CASCADE,
  versao bigint, ativa boolean DEFAULT true
);
INSERT INTO public.clientes VALUES
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');
INSERT INTO public.regras VALUES
  (1, '11111111-1111-1111-1111-111111111111', 7, true);

\ir ../migrations/93.sql

DO $$ BEGIN
  IF (SELECT regras_versao FROM public.clientes WHERE id::text LIKE '1111%') <> 8
     OR (SELECT regras_versao FROM public.clientes WHERE id::text LIKE '2222%') <> 1
  THEN RAISE EXCEPTION 'Caches legados não foram invalidados'; END IF;
END $$;

\ir ../migrations/93.sql

DO $$ BEGIN
  IF (SELECT regras_versao FROM public.clientes WHERE id::text LIKE '1111%') <> 8
  THEN RAISE EXCEPTION 'Replay alterou o contador'; END IF;
END $$;

UPDATE public.regras SET ativa = false WHERE id = 1;
INSERT INTO public.regras (id, cliente_id) VALUES
  (2, '11111111-1111-1111-1111-111111111111');
DO $$ BEGIN
  IF (SELECT versao FROM public.regras WHERE id = 2) <> 10
  THEN RAISE EXCEPTION 'INSERT/UPDATE não avançaram o contador'; END IF;
END $$;
DELETE FROM public.regras WHERE id = 2;
UPDATE public.regras SET cliente_id = '22222222-2222-2222-2222-222222222222' WHERE id = 1;
DO $$ BEGIN
  IF (SELECT regras_versao FROM public.clientes WHERE id::text LIKE '1111%') <> 12
     OR (SELECT regras_versao FROM public.clientes WHERE id::text LIKE '2222%') <> 2
  THEN RAISE EXCEPTION 'DELETE/troca de cliente não invalidaram ambos os caches'; END IF;
END $$;
DELETE FROM public.clientes WHERE id::text LIKE '2222%';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.regras)
  THEN RAISE EXCEPTION 'Cascade bloqueado pelo trigger'; END IF;
END $$;
DROP TRIGGER trigger_versionar_mutacao_regras ON public.regras;
DROP FUNCTION public.versionar_mutacao_regras();
ROLLBACK;
