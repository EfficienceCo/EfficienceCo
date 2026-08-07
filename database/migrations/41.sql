BEGIN;

-- 1. Adiciona as novas colunas de controle do Agente e Máquina de Estados
ALTER TABLE etapas
  ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'pendente' 
    CHECK (status IN ('pendente', 'pronta_para_execucao', 'processando', 'concluida')),
  ADD COLUMN IF NOT EXISTS payload_execucao JSONB,
  ADD COLUMN IF NOT EXISTS arquivo_gerado TEXT,
  ADD COLUMN IF NOT EXISTS erro_execucao TEXT,
  ADD COLUMN IF NOT EXISTS execucao_token UUID,
  ADD COLUMN IF NOT EXISTS execucao_iniciada_em TIMESTAMPTZ;

-- 2. Backfill: Sincroniza o status das etapas já concluídas no modelo antigo
UPDATE etapas SET status = 'concluida' WHERE concluida = TRUE AND status <> 'concluida';

-- 3. Função e Trigger para manter compatibilidade do campo booleano `concluida` com o novo `status`
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

DROP TRIGGER IF EXISTS etapas_sincronizar_status_conclusao ON etapas;

CREATE TRIGGER etapas_sincronizar_status_conclusao
  BEFORE INSERT OR UPDATE OF concluida, status ON etapas
  FOR EACH ROW
  EXECUTE FUNCTION public.sincronizar_status_conclusao_etapa();

-- 4. Travas de Segurança (Constraints) para garantir consistência no Polling e nos Claims
ALTER TABLE etapas
  DROP CONSTRAINT IF EXISTS etapas_status_conclusao_consistente_check,
  DROP CONSTRAINT IF EXISTS etapas_erro_execucao_consistente_check,
  DROP CONSTRAINT IF EXISTS etapas_claim_execucao_consistente_check;

ALTER TABLE etapas
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

-- 5. Índice de Altíssima Performance para o Agente buscar tarefas via Polling (Lock/Claim)
CREATE INDEX IF NOT EXISTS idx_etapas_polling_execucao
  ON etapas (status, execucao_iniciada_em, processo_id)
  WHERE tipo = 'automatizada' AND concluida = FALSE;

-- 6. Documentação das Colunas (Comentários no Schema)
COMMENT ON COLUMN etapas.status IS 'pendente -> pronta_para_execucao -> processando (claim com lease) -> concluida.';
COMMENT ON COLUMN etapas.payload_execucao IS 'Dados preenchidos pelo contador, enviados ao agente quando a etapa fica pronta_para_execucao.';
COMMENT ON COLUMN etapas.arquivo_gerado IS 'Path do arquivo gerado pelo agente ao concluir a automação com sucesso.';
COMMENT ON COLUMN etapas.erro_execucao IS 'Última mensagem de erro reportada pelo agente, exibida ao contador para nova tentativa.';
COMMENT ON COLUMN etapas.execucao_token IS 'Token do claim atual. Impede conclusão duplicada por outro agente.';
COMMENT ON COLUMN etapas.execucao_iniciada_em IS 'Início do claim atual para controle de timeout/lease.';

COMMIT;