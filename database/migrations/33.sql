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