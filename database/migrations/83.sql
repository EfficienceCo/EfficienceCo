-- #374 (ES-5) - endereco cadastral alteravel pelo evento S-2205.
-- JSONB preserva a estrutura exigida pelo XML eSocial (logradouro, CEP, UF etc.)
-- sem bloquear categorias de trabalhador com campos opcionais diferentes.
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS endereco JSONB;
