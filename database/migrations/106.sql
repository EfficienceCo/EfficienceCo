-- 106 — #692 (BUG-CONC-17), revisão do PR #718: FITID único por cliente + banco + conta no banco.
--
-- A checagem feita só no backend perde a corrida de dois uploads simultâneos, e `conta`
-- guarda só os 4 últimos dígitos do ACCTID (contas diferentes colidem). Estas colunas guardam
-- a identidade normalizada (maiúsculas, sem separadores, sem zeros à esquerda; BANKID 0237 = 237),
-- calculada pelo backend (ofx-parser.util.js), e o índice único fecha a corrida.
--
-- Linhas anteriores à migration ficam com as colunas NULL: só os 4 últimos dígitos foram
-- gravados e a conta completa não dá para reconstruir. Elas ficam fora do índice (e da checagem).
-- Extrato sem ACCTID também fica fora do índice: sem conta não há identidade; o backend ainda
-- confere por código.
-- Idempotente.

ALTER TABLE public.transacoes_extrato
  ADD COLUMN IF NOT EXISTS banco_chave TEXT,
  ADD COLUMN IF NOT EXISTS conta_chave TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_transacoes_extrato_cliente_banco_conta_fitid
  ON public.transacoes_extrato (cliente_id, banco_chave, conta_chave, id_banco)
  WHERE id_banco IS NOT NULL AND banco_chave IS NOT NULL AND conta_chave IS NOT NULL;

-- Rollback: DROP INDEX IF EXISTS public.uq_transacoes_extrato_cliente_banco_conta_fitid;
--           ALTER TABLE public.transacoes_extrato DROP COLUMN banco_chave, DROP COLUMN conta_chave;
-- (o backend da #692 grava as duas colunas; reverter junto com o código).
