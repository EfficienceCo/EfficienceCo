-- Migration 016: Path do holerite gerado + tabela de relatórios de fechamento
-- BK-FOLHA-GERAR-SAIDA: holerite é 1:1 com folha_calculos (já existe 1 linha por
-- funcionário, só adiciona onde o PDF foi salvo). Relatório de fechamento é agregado
-- por empresa — um processamento pode conter funcionários de mais de uma empresa-cliente
-- da Souza na mesma planilha, então tabela própria com grão diferente de folha_calculos.
ALTER TABLE folha_calculos ADD COLUMN IF NOT EXISTS holerite_path TEXT;

CREATE TABLE IF NOT EXISTS folha_relatorios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processamento_id UUID NOT NULL REFERENCES processamentos_folha(id),
  empresa VARCHAR NOT NULL,
  total_funcionarios INTEGER NOT NULL,
  total_bruto NUMERIC(14, 2) NOT NULL,
  total_encargos NUMERIC(14, 2) NOT NULL,
  total_liquido NUMERIC(14, 2) NOT NULL,
  arquivo_path TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (processamento_id, empresa)
);

CREATE INDEX IF NOT EXISTS idx_folha_relatorios_processamento_id ON folha_relatorios(processamento_id);
