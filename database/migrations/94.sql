-- #489: concluir uma execução e registrar seu evento são uma única transação.
-- Aplicar antes de distribuir o agente que remove o POST /eventos de etapas.
-- Pré-requisitos: migrations de etapas/claims (#266) e tipos de notificação (48).
CREATE OR REPLACE FUNCTION public.registrar_evento_conclusao_etapa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  empresa TEXT;
  descricao_evento TEXT;
  sucesso_evento BOOLEAN;
BEGIN
  SELECT COALESCE(NULLIF(btrim(nome_empresa), ''), 'empresa') INTO STRICT empresa
  FROM public.processos
  WHERE id = NEW.processo_id AND cliente_id = NEW.cliente_id;

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
  VALUES (NEW.cliente_id, descricao_evento, sucesso_evento);
  INSERT INTO public.notificacoes (cliente_id, tipo, mensagem)
  VALUES (NEW.cliente_id,
    CASE WHEN sucesso_evento THEN 'arquivo_processado' ELSE 'arquivo_erro' END,
    descricao_evento);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_evento_conclusao_etapa ON public.etapas;
CREATE TRIGGER trigger_evento_conclusao_etapa
AFTER UPDATE ON public.etapas
FOR EACH ROW
WHEN (
  OLD.tipo = 'automatizada' AND NEW.tipo = 'automatizada'
  AND OLD.status = 'processando' AND OLD.execucao_token IS NOT NULL
  AND NEW.execucao_token IS NULL
  AND (NEW.status = 'concluida'
    OR (NEW.status = 'pronta_para_execucao' AND NEW.erro_execucao IS NOT NULL))
)
EXECUTE FUNCTION public.registrar_evento_conclusao_etapa();

-- Rollback: primeiro restaurar o envio de eventos pelo agente, então executar:
-- DROP TRIGGER IF EXISTS trigger_evento_conclusao_etapa ON public.etapas;
-- DROP FUNCTION IF EXISTS public.registrar_evento_conclusao_etapa();
