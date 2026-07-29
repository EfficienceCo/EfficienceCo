-- 1. Remover a restrição de chave primária atual da tabela regras
-- O PostgreSQL geralmente nomeia a PK como 'nome_tabela_pkey'
ALTER TABLE regras DROP CONSTRAINT IF EXISTS regras_pkey;

-- 2. Adicionar a nova Chave Primária Composta (id + cliente_id)
ALTER TABLE regras ADD PRIMARY KEY (id, cliente_id);

-- 3. (Opcional) Garantir que o cliente_id não seja nulo
ALTER TABLE regras ALTER COLUMN cliente_id SET NOT NULL;