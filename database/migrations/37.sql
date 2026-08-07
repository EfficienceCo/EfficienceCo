-- ========================================================
-- 1. CORREÇÃO DA TABELA: licencas
-- ========================================================
-- Restaura o 'id' como única PK
ALTER TABLE licencas DROP CONSTRAINT IF EXISTS licencas_pkey;
ALTER TABLE licencas ADD PRIMARY KEY (id);
ALTER TABLE licencas ALTER COLUMN cliente_id SET NOT NULL;

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_licencas_token ON licencas(token);
CREATE INDEX IF NOT EXISTS idx_licencas_cliente_id ON licencas(cliente_id);


-- ========================================================
-- 2. CORREÇÃO DA TABELA: eventos
-- ========================================================
-- Restaura o 'id' como única PK
ALTER TABLE eventos DROP CONSTRAINT IF EXISTS eventos_pkey;
ALTER TABLE eventos ADD PRIMARY KEY (id);
ALTER TABLE eventos ALTER COLUMN cliente_id SET NOT NULL;

-- Índice de performance para buscas do cliente/agente
CREATE INDEX IF NOT EXISTS idx_eventos_cliente_id ON eventos(cliente_id);


-- ========================================================
-- 3. CORREÇÃO DA TABELA: regras
-- ========================================================
-- Restaura o 'id' como única PK
ALTER TABLE regras DROP CONSTRAINT IF EXISTS regras_pkey;
ALTER TABLE regras ADD PRIMARY KEY (id);
ALTER TABLE regras ALTER COLUMN cliente_id SET NOT NULL;

-- Índice de performance para buscas do cliente/agente
CREATE INDEX IF NOT EXISTS idx_regras_cliente_id ON regras(cliente_id);