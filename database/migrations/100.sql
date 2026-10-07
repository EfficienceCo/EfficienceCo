-- #635: hotfix do trigger da 94 — etapas.cliente_id não existe desde a 39.
-- Ambientes que já aplicaram a 94 quebrada precisam desta migration (ou
-- reaplicar a 94 corrigida). CREATE OR REPLACE é idempotente.
CREATE OR REPLACE FUNCTION public.registrar_evento_conclusao_etapa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  empresa TEXT;
  cliente_alvo UUID;
  descricao_evento TEXT;
  sucesso_evento BOOLEAN;
BEGIN
  SELECT
    COALESCE(NULLIF(btrim(nome_empresa), ''), 'empresa'),
    cliente_id
  INTO STRICT empresa, cliente_alvo
  FROM public.processos
  WHERE id = NEW.processo_id;

  sucesso_evento := NEW.status = 'concluida';
  IF NOT sucesso_evento THEN
    descricao_evento := format('Falha ao processar etapa %s (%s): %s',
      COALESCE(NEW.acao, 'desconhecida'), empresa,
      COALESCE(NULLIF(btrim(NEW.erro_execucao), ''), 'erro desconhecido'));
  ELSIF NEW.acao = 'criar_pastas' THEN
    descricao_evento := format('Estrutura de pastas criada para %s', empresa);
  ELSIF NEW.acao = 'gerar_contrato_social' THEN
    descricao_evento := format('Contrato social gerado para %s', empresa);
  ELSE
    descricao_evento := format('Etapa %s concluída para %s',
      COALESCE(NEW.acao, 'desconhecida'), empresa);
  END IF;

  INSERT INTO public.eventos (cliente_id, descricao, sucesso)
  VALUES (cliente_alvo, descricao_evento, sucesso_evento);
  INSERT INTO public.notificacoes (cliente_id, tipo, mensagem)
  VALUES (cliente_alvo,
    CASE WHEN sucesso_evento THEN 'arquivo_processado' ELSE 'arquivo_erro' END,
    descricao_evento);
  RETURN NEW;
END;
$$;

-- Rollback: reaplicar a versão anterior da function (não recomendado — quebrava
-- o schema pós-39). Preferir manter esta definição.
