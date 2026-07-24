-- Migration 014: Criar tabela de processamentos de folha de pagamento
-- Um registro por planilha recebida (agente ou web) — status evolui
-- pendente -> processando -> concluido | erro nas próximas tasks (BK-FOLHA-CALC, BK-FOLHA-GERAR-SAIDA).
CREATE TABLE IF NOT EXISTS processamentos_folha (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  mes_referencia DATE NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'processando', 'concluido', 'erro')),
  arquivo_origem_path TEXT NOT NULL,
  motivo_erro TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processamentos_folha_cliente_id ON processamentos_folha(cliente_id);
