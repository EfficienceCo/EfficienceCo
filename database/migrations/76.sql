CREATE TABLE IF NOT EXISTS funcionarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  cpf VARCHAR NOT NULL,
  nome VARCHAR NOT NULL,
  data_admissao DATE NOT NULL,
  data_desligamento DATE,
  cargo VARCHAR,
  cbo VARCHAR,
  categoria TEXT NOT NULL,
  salario NUMERIC(12,2) NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cliente_id, cpf, data_admissao)
);

ALTER TABLE funcionarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY funcionarios_service_role ON funcionarios TO service_role USING (true) WITH CHECK (true);
