CREATE TABLE IF NOT EXISTS apuracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  periodo_mes INTEGER NOT NULL CHECK (periodo_mes BETWEEN 1 AND 12),
  periodo_ano INTEGER NOT NULL CHECK (periodo_ano >= 2020),
  regime TEXT NOT NULL CHECK (regime IN ('simples_nacional', 'lucro_presumido')),
  rbt12_usado NUMERIC(15,2) NOT NULL,
  receita_mes NUMERIC(15,2) NOT NULL,
  anexo TEXT CHECK (anexo IN ('I','II','III','IV','V')),
  fator_r NUMERIC(5,4),
  folha12 NUMERIC(15,2),
  aliquota_efetiva NUMERIC(5,4) NOT NULL,
  valor_calculado NUMERIC(15,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','aprovado')),
  valor_editado NUMERIC(15,2),
  historico_edicoes JSONB DEFAULT '[]'::jsonb,
  aprovado_por TEXT,
  aprovado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cliente_id, periodo_mes, periodo_ano, regime)
);
ALTER TABLE apuracoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY apuracoes_service_role ON apuracoes TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trigger_atualizar_apuracoes
  BEFORE UPDATE ON apuracoes
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();