-- Migration 019: suportar etapas automatizadas (issue #264 / #266)
-- Etapa automatizada: contador preenche dados no webapp -> agente executa via polling -> reporta conclusão.

ALTER TABLE etapas
  ADD COLUMN tipo VARCHAR NOT NULL DEFAULT 'manual' CHECK (tipo IN ('manual', 'automatizada')),
  ADD COLUMN acao VARCHAR CHECK (acao IN ('gerar_contrato_social', 'criar_pastas')),
  ADD COLUMN status VARCHAR NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pronta_para_execucao', 'concluida')),
  ADD COLUMN payload_execucao JSONB,
  ADD COLUMN arquivo_gerado TEXT,
  ADD COLUMN erro_execucao TEXT;

-- Backfill: etapas já concluídas (campo legado `concluida`) entram como status 'concluida'.
UPDATE etapas SET status = 'concluida' WHERE concluida = TRUE;

COMMENT ON COLUMN etapas.tipo IS 'manual: checkbox tradicional. automatizada: form + execução via agente.';
COMMENT ON COLUMN etapas.acao IS 'Identifica a automação a rodar no agente quando tipo = automatizada. NULL para etapas manuais.';
COMMENT ON COLUMN etapas.status IS 'pendente -> pronta_para_execucao (payload salvo, aguardando polling do agente) -> concluida. Mantido em sincronia com o booleano legado `concluida`.';
COMMENT ON COLUMN etapas.payload_execucao IS 'Dados preenchidos pelo contador, enviados ao agente quando a etapa fica pronta_para_execucao.';
COMMENT ON COLUMN etapas.arquivo_gerado IS 'Path do arquivo gerado pelo agente ao concluir a automação com sucesso.';
COMMENT ON COLUMN etapas.erro_execucao IS 'Última mensagem de erro reportada pelo agente, exibida ao contador para nova tentativa.';
