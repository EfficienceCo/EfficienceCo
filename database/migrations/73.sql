-- Suporte a verificação de pastas de folha de pagamento pelo agente
-- (Fator R — AP-3 / #365). Relevante só para clientes do Anexo V; nos demais
-- anexos a coluna fica sem uso (o endpoint de polling já filtra por
-- fator_r IS NOT NULL, que só é preenchido para apurações originadas de
-- clientes Anexo V — mesmo critério já usado em detalharApuracao()).
ALTER TABLE apuracoes
  ADD COLUMN IF NOT EXISTS folha_status TEXT DEFAULT 'pendente'
    CHECK (folha_status IN ('pendente', 'verificado', 'sem_dados'));

-- Resultado bruto reportado pelo agente (meses encontrados nas pastas locais).
ALTER TABLE apuracoes
  ADD COLUMN IF NOT EXISTS dados_folha JSONB;

-- Índice parcial para o polling do agente (GET /apuracoes/folha-pendente),
-- que sempre filtra por cliente_id + fator_r IS NOT NULL + folha_status = 'pendente'.
CREATE INDEX IF NOT EXISTS idx_apuracoes_folha_pendente
  ON apuracoes (cliente_id, folha_status)
  WHERE fator_r IS NOT NULL;
