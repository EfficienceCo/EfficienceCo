BEGIN;

-- 1. Remove a PK antiga com o nome correto
ALTER TABLE obrigacoes DROP CONSTRAINT IF EXISTS pk_obrigacoes;

-- 2. Cria a nova PK apenas na coluna id
ALTER TABLE obrigacoes ADD CONSTRAINT pk_obrigacoes PRIMARY KEY (id);

COMMIT;