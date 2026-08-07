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

-- Restaura Primary Key Única em 'id' caso haja drift de chave composta
ALTER TABLE obrigacoes DROP CONSTRAINT IF EXISTS obrigacoes_pkey;
ALTER TABLE obrigacoes ADD CONSTRAINT obrigacoes_pkey PRIMARY KEY (id);


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

-- Restaura Primary Key Única em 'id'
ALTER TABLE notificacoes DROP CONSTRAINT IF EXISTS notificacoes_pkey;
ALTER TABLE notificacoes ADD CONSTRAINT notificacoes_pkey PRIMARY KEY (id);

COMMIT;