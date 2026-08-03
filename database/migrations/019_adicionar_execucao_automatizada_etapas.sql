-- Migration 019: suportar etapas automatizadas (issue #264 / #266)
-- Etapa automatizada: contador preenche dados no webapp -> agente executa via polling -> reporta conclusão.

BEGIN;

ALTER TABLE etapas
  ADD COLUMN tipo VARCHAR NOT NULL DEFAULT 'manual' CHECK (tipo IN ('manual', 'automatizada')),
  ADD COLUMN acao VARCHAR CHECK (acao IN ('gerar_contrato_social', 'criar_pastas')),
  ADD COLUMN status VARCHAR NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pronta_para_execucao', 'processando', 'concluida')),
  ADD COLUMN payload_execucao JSONB,
  ADD COLUMN arquivo_gerado TEXT,
  ADD COLUMN erro_execucao TEXT,
  ADD COLUMN execucao_token UUID,
  ADD COLUMN execucao_iniciada_em TIMESTAMPTZ;

-- Backfill: etapas já concluídas (campo legado `concluida`) entram como status 'concluida'.
UPDATE etapas SET status = 'concluida' WHERE concluida = TRUE;

-- Compatibilidade de rollout: o backend anterior à #266 atualiza apenas `concluida`.
-- O trigger mantém `status` sincronizado durante a janela entre migration e deploy.
CREATE OR REPLACE FUNCTION public.sincronizar_status_conclusao_etapa()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.concluida = TRUE THEN
    NEW.status := 'concluida';
    NEW.execucao_token := NULL;
    NEW.execucao_iniciada_em := NULL;
  ELSIF TG_OP = 'UPDATE' AND OLD.concluida = TRUE AND NEW.status = 'concluida' THEN
    NEW.status := 'pendente';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER etapas_sincronizar_status_conclusao
  BEFORE INSERT OR UPDATE OF concluida, status ON etapas
  FOR EACH ROW
  EXECUTE FUNCTION public.sincronizar_status_conclusao_etapa();

ALTER TABLE etapas
  ADD CONSTRAINT etapas_tipo_acao_consistente_check CHECK (
    (tipo = 'manual' AND acao IS NULL)
    OR (tipo = 'automatizada' AND acao IS NOT NULL)
  ),
  ADD CONSTRAINT etapas_status_conclusao_consistente_check CHECK (
    (status = 'concluida') = concluida
  ),
  ADD CONSTRAINT etapas_erro_execucao_consistente_check CHECK (
    erro_execucao IS NULL
    OR (status = 'pronta_para_execucao' AND concluida = FALSE)
  ),
  ADD CONSTRAINT etapas_claim_execucao_consistente_check CHECK (
    (
      status = 'processando'
      AND execucao_token IS NOT NULL
      AND execucao_iniciada_em IS NOT NULL
      AND erro_execucao IS NULL
    )
    OR (
      status <> 'processando'
      AND execucao_token IS NULL
      AND execucao_iniciada_em IS NULL
    )
  );

CREATE INDEX idx_etapas_polling_execucao
  ON etapas (status, execucao_iniciada_em, processo_id)
  WHERE tipo = 'automatizada' AND concluida = FALSE;

CREATE INDEX IF NOT EXISTS idx_processos_cliente_status
  ON processos (cliente_id, status);

COMMENT ON COLUMN etapas.tipo IS 'manual: checkbox tradicional. automatizada: form + execução via agente.';
COMMENT ON COLUMN etapas.acao IS 'Identifica a automação a rodar no agente quando tipo = automatizada. NULL para etapas manuais.';
COMMENT ON COLUMN etapas.status IS 'pendente -> pronta_para_execucao -> processando (claim com lease) -> concluida. Falha volta para pronta_para_execucao com erro e exige reenvio explícito.';
COMMENT ON COLUMN etapas.payload_execucao IS 'Dados preenchidos pelo contador, enviados ao agente quando a etapa fica pronta_para_execucao.';
COMMENT ON COLUMN etapas.arquivo_gerado IS 'Path do arquivo gerado pelo agente ao concluir a automação com sucesso.';
COMMENT ON COLUMN etapas.erro_execucao IS 'Última mensagem de erro reportada pelo agente, exibida ao contador para nova tentativa.';
COMMENT ON COLUMN etapas.execucao_token IS 'Token do claim atual. Impede conclusão duplicada ou atrasada por outro agente.';
COMMENT ON COLUMN etapas.execucao_iniciada_em IS 'Início do claim atual. Claims abandonados podem ser retomados após o lease.';

COMMIT;
