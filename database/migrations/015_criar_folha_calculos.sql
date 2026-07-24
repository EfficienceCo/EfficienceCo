-- Migration 015: Criar tabela de cálculos de folha de pagamento por funcionário
-- Um registro por funcionário da planilha, vinculado ao processamento (BK-FOLHA-UPLOAD).
-- Preenchida pelo BK-FOLHA-CALC; consumida pelo BK-FOLHA-GERAR-SAIDA (holerite + relatório).
CREATE TABLE IF NOT EXISTS folha_calculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processamento_id UUID NOT NULL REFERENCES processamentos_folha(id),
  empresa VARCHAR NOT NULL,
  funcionario VARCHAR NOT NULL,
  cpf VARCHAR NOT NULL,
  cargo VARCHAR NOT NULL,
  salario_bruto NUMERIC(12, 2) NOT NULL,
  dias_trabalhados NUMERIC(5, 2) NOT NULL,
  horas_extras NUMERIC(6, 2) NOT NULL DEFAULT 0,
  faltas NUMERIC(5, 2) NOT NULL DEFAULT 0,
  adiantamento NUMERIC(12, 2) NOT NULL DEFAULT 0,
  num_dependentes INTEGER NOT NULL DEFAULT 0,
  vale_transporte BOOLEAN NOT NULL DEFAULT FALSE,
  valor_horas_extras NUMERIC(12, 2) NOT NULL,
  valor_faltas NUMERIC(12, 2) NOT NULL,
  desconto_vt NUMERIC(12, 2) NOT NULL,
  base_calculo NUMERIC(12, 2) NOT NULL,
  inss NUMERIC(12, 2) NOT NULL,
  fgts NUMERIC(12, 2) NOT NULL,
  ir NUMERIC(12, 2) NOT NULL,
  liquido NUMERIC(12, 2) NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folha_calculos_processamento_id ON folha_calculos(processamento_id);
