
BEGIN;

-- 1. Tabela CLIENTES: Remove redundâncias de authenticated
DROP POLICY IF EXISTS "Clientes: acesso próprio" ON clientes;
-- Mantém apenas: Policy_Clientes_Isolamento

-- 2. Tabela EVENTOS: Remove duplicata de authenticated
DROP POLICY IF EXISTS "Eventos: isolamento por cliente" ON eventos;
-- Mantém: Policy_Eventos_Isolamento (ALL) e a política específica de SELECT se necessário

-- 3. Tabela LICENCAS: Remove redundâncias de authenticated
DROP POLICY IF EXISTS "Licenças: isolamento por cliente" ON licencas;
-- Mantém apenas: Policy_Licencas_Isolamento

-- 4. Tabela REGRAS: Remove redundâncias de authenticated
DROP POLICY IF EXISTS "Regras: isolamento por cliente" ON regras;
-- Mantém apenas: Policy_Regras_Isolamento

-- 5. Tabela USUARIOS: Limpa política antiga 'public' e duplicatas de authenticated
DROP POLICY IF EXISTS "Usuários: isolamento por cliente" ON usuarios;
DROP POLICY IF EXISTS "Usuarios só veem dados da própria empresa" ON usuarios;
-- Mantém apenas: Policy_Usuarios_Isolamento

COMMIT;