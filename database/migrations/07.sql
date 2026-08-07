-- 1. Remover a restrição de chave primária atual da tabela eventos
-- O PostgreSQL geralmente nomeia a PK como 'nome_tabela_pkey'
ALTER TABLE eventos DROP CONSTRAINT IF EXISTS eventos_pkey;

-- 2. Adicionar a nova Chave Primária Composta (id + cliente_id)
ALTER TABLE eventos ADD PRIMARY KEY (id, cliente_id);

-- 3. (Opcional) Garantir que o cliente_id não seja nulo
ALTER TABLE eventos ALTER COLUMN cliente_id SET NOT NULL;