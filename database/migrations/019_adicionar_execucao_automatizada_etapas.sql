-- Migration 019: adiciona metadados e estado de execução às etapas automatizadas.

ALTER TABLE etapas
  ADD COLUMN tipo VARCHAR NOT NULL DEFAULT 'manual'
    CHECK (tipo IN ('manual', 'automatizada')),
  ADD COLUMN acao VARCHAR
    CHECK (acao IN ('gerar_contrato_social', 'criar_pastas')),
  ADD COLUMN status VARCHAR NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'pronta_para_execucao', 'concluida')),
  ADD COLUMN payload_execucao JSONB,
  ADD COLUMN arquivo_gerado TEXT,
  ADD COLUMN erro_execucao TEXT;

-- Mantém o novo status coerente com etapas concluídas antes desta migration.
UPDATE etapas
SET status = 'concluida'
WHERE concluida = TRUE;

COMMENT ON COLUMN etapas.tipo IS
  'manual: checkbox tradicional; automatizada: formulário e execução pelo agente.';
COMMENT ON COLUMN etapas.acao IS
  'Automação executada pelo agente; nula para etapas manuais.';
COMMENT ON COLUMN etapas.status IS
  'Estado da execução: pendente, pronta_para_execucao ou concluida.';
COMMENT ON COLUMN etapas.payload_execucao IS
  'Dados informados no formulário e enviados ao agente.';
COMMENT ON COLUMN etapas.arquivo_gerado IS
  'Caminho ou URL do arquivo produzido pelo agente.';
COMMENT ON COLUMN etapas.erro_execucao IS
  'Última mensagem de erro reportada pelo agente.';
