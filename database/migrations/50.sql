BEGIN;

-- ==========================================
-- 1. Sincronização da tabela: OBRIGACOES
-- ==========================================

-- Garante tipo de data correto
ALTER TABLE obrigacoes 
  ALTER COLUMN data_vencimento TYPE DATE USING data_vencimento::DATE;

-- Garante valores padrão nas colunas
ALTER TABLE obrigacoes 
  ALTER COLUMN recorrente SET DEFAULT TRUE,
  ALTER COLUMN status SET DEFAULT 'pendente',
  ALTER COLUMN criado_em SET DEFAULT NOW();

-- A conversão da chave primária de obrigacoes é feita em 51.sql.


-- ==========================================
-- 2. Sincronização da tabela: NOTIFICACOES
-- ==========================================

-- Garante tipo TIMESTAMPTZ em vez de TIMESTAMP sem fuso
ALTER TABLE notificacoes 
  ALTER COLUMN criado_em TYPE TIMESTAMPTZ USING criado_em::TIMESTAMPTZ,
  ALTER COLUMN criado_em SET DEFAULT NOW();

-- Garante valores padrão
ALTER TABLE notificacoes 
  ALTER COLUMN lida SET DEFAULT FALSE;

-- A conversão da chave primária de notificacoes é feita em 52.sql.

COMMIT;
