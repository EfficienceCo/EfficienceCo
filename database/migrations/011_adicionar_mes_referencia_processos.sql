-- Migration 011: Adicionar mes_referencia em processos
-- Usado para garantir idempotência na geração automática de folha mensal

ALTER TABLE processos
  ADD COLUMN mes_referencia DATE;

COMMENT ON COLUMN processos.mes_referencia IS 'Mês de referência (YYYY-MM-01). Preenchido apenas em processos do tipo folha_pagamento gerados automaticamente.';
