-- #529 — job diário de alertas de vencimento de obrigações nos marcos 60/30/7/3/0.
-- Antes existia só um limiar fixo de <= 3 dias disparado como efeito colateral de
-- quem abria o dashboard (GET /obrigacoes/proximas). Os marcos 3 e 0 substituem esse
-- limiar: lembrete de última hora e aviso no próprio dia do vencimento.
-- Idempotência por marco alertado, no mesmo formato do CD-3 (migration 87).

ALTER TABLE obrigacoes
  ADD COLUMN IF NOT EXISTS ultimo_marco_alertado INTEGER;

ALTER TABLE obrigacoes
  DROP CONSTRAINT IF EXISTS obrigacoes_ultimo_marco_alertado_check;

ALTER TABLE obrigacoes
  ADD CONSTRAINT obrigacoes_ultimo_marco_alertado_check
  CHECK (ultimo_marco_alertado IS NULL OR ultimo_marco_alertado IN (60, 30, 7, 3, 0));

-- A varredura diária filtra por status + data_vencimento; o índice de 21.sql
-- (data_vencimento, status) já cobre, nada a criar.

-- Rollback:
-- ALTER TABLE obrigacoes DROP CONSTRAINT IF EXISTS obrigacoes_ultimo_marco_alertado_check;
-- ALTER TABLE obrigacoes DROP COLUMN IF EXISTS ultimo_marco_alertado;
