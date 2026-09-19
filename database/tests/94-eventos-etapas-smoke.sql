-- Somente em banco DESCARTÁVEL vazio. Fixtures em public; ROLLBACK ao final.
-- psql -X -v ON_ERROR_STOP=1 -f database/tests/94-eventos-etapas-smoke.sql
BEGIN;
CREATE TABLE public.processos (
  id uuid, cliente_id uuid, nome_empresa text, PRIMARY KEY (id, cliente_id)
);
CREATE TABLE public.etapas (
  id int PRIMARY KEY, processo_id uuid, cliente_id uuid, tipo text,
  acao text, status text, execucao_token uuid, erro_execucao text,
  FOREIGN KEY (processo_id, cliente_id) REFERENCES public.processos
);
CREATE TABLE public.eventos (cliente_id uuid, descricao text, sucesso boolean);
CREATE TABLE public.notificacoes (cliente_id uuid, tipo text, mensagem text);
INSERT INTO public.processos VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Padaria'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Souza');
INSERT INTO public.etapas VALUES
  (1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'automatizada', 'criar_pastas', 'processando', '123e4567-e89b-42d3-a456-426614174000', NULL),
  (2, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222',
   'automatizada', 'gerar_contrato_social', 'processando', '123e4567-e89b-42d3-a456-426614174000', NULL),
  (3, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'manual', NULL, 'pendente', NULL, NULL);

\ir ../migrations/94.sql
\ir ../migrations/94.sql

UPDATE public.etapas SET status = 'concluida', execucao_token = NULL WHERE id = 1;
-- Callback repetido e conclusão manual não duplicam eventos.
UPDATE public.etapas SET status = 'concluida', execucao_token = NULL WHERE id IN (1, 3);
-- Trocar claim expirado não significa concluir a execução.
UPDATE public.etapas SET execucao_token = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' WHERE id = 2;
-- Um callback atrasado não atualiza a linha, portanto não gera evento.
UPDATE public.etapas SET status = 'concluida', execucao_token = NULL
WHERE id = 2 AND execucao_token = '123e4567-e89b-42d3-a456-426614174000';
UPDATE public.etapas SET status = 'pronta_para_execucao', execucao_token = NULL,
  erro_execucao = 'Sem permissão' WHERE id = 2;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.eventos) <> 2
     OR (SELECT count(*) FROM public.notificacoes) <> 2
  THEN RAISE EXCEPTION 'Eventos/notificações ausentes ou duplicados'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.eventos WHERE sucesso
      AND cliente_id = '11111111-1111-1111-1111-111111111111'
      AND descricao = 'Estrutura de pastas criada para Padaria')
    OR NOT EXISTS (SELECT 1 FROM public.eventos WHERE NOT sucesso
      AND cliente_id = '22222222-2222-2222-2222-222222222222'
      AND descricao = 'Falha ao processar etapa gerar_contrato_social (Souza): Sem permissão')
  THEN RAISE EXCEPTION 'Descrição ou isolamento de cliente incorretos'; END IF;
END $$;

-- Nova tentativa pode gerar seu próprio evento. Falha de persistência deve
-- preservar o claim e o status anterior, sem evento/notificação parcial.
UPDATE public.etapas SET status = 'processando', erro_execucao = NULL,
  execucao_token = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' WHERE id = 2;
ALTER TABLE public.eventos ADD CONSTRAINT simular_falha_evento CHECK (NOT sucesso) NOT VALID;
DO $$ BEGIN
  BEGIN
    UPDATE public.etapas SET status = 'concluida', execucao_token = NULL WHERE id = 2;
    RAISE EXCEPTION 'Esperava falha de evento';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT status FROM public.etapas WHERE id = 2) <> 'processando'
     OR (SELECT execucao_token FROM public.etapas WHERE id = 2) IS NULL
     OR (SELECT count(*) FROM public.eventos) <> 2
  THEN RAISE EXCEPTION 'Falha de evento não reverteu a conclusão'; END IF;
END $$;
ALTER TABLE public.eventos DROP CONSTRAINT simular_falha_evento;
ALTER TABLE public.notificacoes ADD CONSTRAINT simular_falha_notificacao
  CHECK (tipo <> 'arquivo_processado') NOT VALID;
DO $$ BEGIN
  BEGIN
    UPDATE public.etapas SET status = 'concluida', execucao_token = NULL WHERE id = 2;
    RAISE EXCEPTION 'Esperava falha de notificação';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT status FROM public.etapas WHERE id = 2) <> 'processando'
     OR (SELECT count(*) FROM public.eventos) <> 2
  THEN RAISE EXCEPTION 'Falha de notificação deixou commit parcial'; END IF;
END $$;
ALTER TABLE public.notificacoes DROP CONSTRAINT simular_falha_notificacao;
UPDATE public.etapas SET status = 'concluida', execucao_token = NULL WHERE id = 2;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.eventos WHERE sucesso
      AND descricao = 'Contrato social gerado para Souza')
    OR (SELECT count(*) FROM public.eventos) <> 3
  THEN RAISE EXCEPTION 'Retry não persistiu conclusão'; END IF;
END $$;
DROP TRIGGER trigger_evento_conclusao_etapa ON public.etapas;
DROP FUNCTION public.registrar_evento_conclusao_etapa();
ROLLBACK;
