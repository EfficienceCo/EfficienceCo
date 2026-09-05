-- CD-1 (#408) - certificados digitais (A1/A3) por cliente.
-- Motor prazo/alerta espelha obrigacoes; renovacao_checklist materializa os
-- passos de renovacao (ramificados por tipo) quando o CD-2 inicia a renovacao.
CREATE TABLE IF NOT EXISTS certificados_digitais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('A1','A3')),
  serial TEXT,
  titular TEXT,
  validade DATE NOT NULL,
  caminho_local TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','renovacao_iniciada','vencido','substituido')),
  renovacao_checklist JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_certificados_digitais_cliente_validade
  ON certificados_digitais (cliente_id, validade);

ALTER TABLE certificados_digitais ENABLE ROW LEVEL SECURITY;
CREATE POLICY certificados_digitais_service_role ON certificados_digitais TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trigger_atualizar_certificados_digitais
  BEFORE UPDATE ON certificados_digitais
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();
